// src/lib/renovar-assinatura.ts — renovação de assinatura no banco (datas, pagamento, histórico,
// crédito do servidor, aviso no WhatsApp). Usada pela rota PUT /api/assinaturas/[id]/renovar (botão
// Renovar) e pela renovação automática do Pix pelo link (src/lib/pix-renovacao.ts): mesmo código nos
// dois caminhos. As datas novas vêm prontas de quem chama (o botão calcula no navegador; o Pix com
// as mesmas regras em src/lib/datas-renovacao.ts).
import { pool } from "@/lib/db";
import { abaterCreditoRenovacao } from "@/lib/saldoServidor";
import { notificarRenovacao } from "@/lib/notificar-renovacao";
import { registrarAudit } from "@/lib/audit";

export type Periodo = "mensal" | "trimestral" | "semestral" | "anual";

function mesesDoPeriodo(p: Periodo) {
  switch (p) {
    case "trimestral": return 3;
    case "semestral": return 6;
    case "anual": return 12;
    default: return 1;
  }
}

export type EntradaRenovacao = {
  idAssinatura: string;
  periodo: Periodo;
  dataManual: string | null;
  registrarPagamento: boolean;
  pagamento: { idCliente?: string; nomeCliente?: string | null; pacoteNome?: string | null; forma?: string; valor?: string | number } | null;
  vencContasManual: string | null;
  soPagamento: boolean;
  atualizarObservacao: boolean;
  observacao: string | null;
  statusFinal: "ativo" | "pendente" | null;
  origem: Record<string, unknown>;
  /** Quem fez, quando não há sessão (renovação automática). */
  usuarioAuditoria?: string;
};

export type ResultadoRenovacao = {
  httpStatus: number;
  corpo: {
    ok: boolean;
    error?: string;
    assinatura?: { id_assinatura: string; venc_contrato: string; venc_contas: string | null; status: string; id_cliente: string };
    whatsapp?: unknown;
  };
};

export async function renovarAssinatura(e: EntradaRenovacao): Promise<ResultadoRenovacao> {
  const { idAssinatura, periodo, dataManual, registrarPagamento, vencContasManual, soPagamento,
          atualizarObservacao, observacao, statusFinal, origem, usuarioAuditoria } = e;
  const pgto = e.pagamento;
  const meses = mesesDoPeriodo(periodo);

  const client = await pool.connect();

  // Modo soPagamento (assinatura já pendente — registra pagamento e ativa).
  // O mês em aberto já foi contado quando a assinatura virou pendente, então num pagamento
  // de N meses o front manda dataManual = venc_contrato atual + (N-1) meses. Sem dataManual
  // (mensal) as datas ficam como estão.
  if (soPagamento) {
    try {
      await client.query("BEGIN");

      // Captura venc_contrato antes de ativar para calcular tipo_pagamento.
      // Como a assinatura estava pendente, venc_contrato já foi avançado um ciclo (1 mês)
      // na renovação anterior. Subtraímos esse mês para obter o vencimento original —
      // fixo em 1, independente do período pago agora.
      const { rows: vcRows } = await client.query(
        `SELECT (CURRENT_DATE - (venc_contrato - make_interval(months => 1))::date)::int AS dias_rel,
                venc_contas::text AS venc_contas_anterior,
                venc_contrato::text AS venc_contrato_anterior,
                status AS status_anterior,
                id_cliente::text AS id_cliente
         FROM public.assinaturas WHERE id_assinatura = $1::bigint`,
        [idAssinatura]
      );
      if (vcRows.length === 0) {
        await client.query("ROLLBACK");
        return { httpStatus: 404, corpo: { ok: false, error: `Assinatura ${idAssinatura} não encontrada` } };
      }
      const diasRelSoPag: number | null = vcRows[0]?.dias_rel ?? null;
      const vencContasAnteriorSoPag: string | null = vcRows[0]?.venc_contas_anterior ?? null;
      const tipoPagSoPag =
        diasRelSoPag == null ? "novo"
        : diasRelSoPag > 0   ? "atrasado"
        : "adiantado";

      const { rows: atualizada } = await client.query(
        `UPDATE public.assinaturas
         SET status = 'ativo',
             venc_contrato = COALESCE($2::date, venc_contrato),
             venc_contas   = COALESCE($3::date, venc_contas),
             atualizado_em = NOW()
         WHERE id_assinatura = $1::bigint
         RETURNING venc_contas::text AS venc_contas, venc_contrato::text AS venc_contrato`,
        [idAssinatura, dataManual, vencContasManual]
      );
      const vencContasNovaSoPag: string | null = atualizada[0]?.venc_contas ?? null;

      // Só abate crédito se o venc. contas realmente mudou (a função ainda ignora avanços < 15 dias)
      if (vencContasManual && vencContasNovaSoPag !== vencContasAnteriorSoPag) {
        await abaterCreditoRenovacao(client, idAssinatura, vencContasAnteriorSoPag, vencContasNovaSoPag);
      }

      let ehNovoSoPag = false;
      let idPagamentoSoPag: string | null = null;
      if (registrarPagamento && pgto) {
        const idCliente = pgto.idCliente;

        const { rows: ultPgto } = await client.query(
          `SELECT (CURRENT_DATE - data_pgto::date)::int AS dias
           FROM public.pagamentos
           WHERE id_cliente = $1::bigint
           ORDER BY data_pgto DESC NULLS LAST LIMIT 1`,
          [idCliente]
        );
        ehNovoSoPag = ultPgto.length === 0;
        const detalhes = ultPgto.length > 0 && ultPgto[0].dias != null
          ? `${parseInt(ultPgto[0].dias, 10)} dias desde o último pagamento`
          : "novo";

        const { rows: pgRows } = await client.query(
          `INSERT INTO public.pagamentos
           (id_cliente, cliente, compra, data_pgto, forma, valor, detalhes, tipo,
            tipo_pagamento, dias_relativo_vencimento, atualizado_em, id_assinatura)
           VALUES ($1::bigint, $2, $3, CURRENT_DATE, $4, $5::numeric, $6, 'Assinatura tv',
                   $7, $8, NOW(), $9::bigint)
           RETURNING id::text`,
          [idCliente, pgto.nomeCliente ?? null, pgto.pacoteNome ?? null,
           pgto.forma ?? "INTER", pgto.valor ?? 0, detalhes,
           tipoPagSoPag, diasRelSoPag, idAssinatura]
        );
        idPagamentoSoPag = pgRows[0]?.id ?? null;
      }

      await registrarAudit(client, {
        usuario: usuarioAuditoria,
        tipo: "renovacao",
        id_cliente: vcRows[0].id_cliente,
        id_assinatura: idAssinatura,
        descricao: idPagamentoSoPag
          ? `Pagamento confirmado (pendente → ativo), ${periodo}, pagamento #${idPagamentoSoPag}`
          : `Pendente → ativo, ${periodo}, sem pagamento`,
        dados_antes: {
          status: vcRows[0].status_anterior,
          venc_contrato: vcRows[0].venc_contrato_anterior,
          venc_contas: vencContasAnteriorSoPag,
        },
        dados_depois: {
          status: "ativo",
          venc_contrato: atualizada[0]?.venc_contrato ?? null,
          venc_contas: vencContasNovaSoPag,
          id_pagamento: idPagamentoSoPag,
          valor: idPagamentoSoPag ? pgto?.valor ?? null : null,
          forma: idPagamentoSoPag ? pgto?.forma ?? "INTER" : null,
          ...origem,
        },
      });

      await client.query("COMMIT");

      let whatsapp = undefined;
      if (registrarPagamento && pgto?.idCliente) {
        const { rows: vencRows } = await pool.query(
          `SELECT a.venc_contrato::text AS venc_contrato, a.identificacao, p.telas
           FROM public.assinaturas a JOIN public.planos p ON p.id_plano = a.id_plano
           WHERE a.id_assinatura = $1::bigint`,
          [idAssinatura]
        );
        whatsapp = await notificarRenovacao(pgto.idCliente, vencRows[0]?.venc_contrato ?? null, vencRows[0]?.telas ?? null, ehNovoSoPag, vencRows[0]?.identificacao ?? null);
      }

      return { httpStatus: 200, corpo: { ok: true, whatsapp } };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  // Renovação completa (altera datas)
  try {
    await client.query("BEGIN");

    const { rows: antes } = await client.query(
      `SELECT
         venc_contas::text    AS venc_contas_anterior,
         venc_contrato::text  AS venc_contrato_anterior,
         (CURRENT_DATE - venc_contrato)::int AS dias_rel_vencimento,
         status               AS status_anterior
       FROM public.assinaturas WHERE id_assinatura = $1::bigint`,
      [idAssinatura]
    );
    const vencContasAnterior: string | null    = antes[0]?.venc_contas_anterior    ?? null;
    const diasRelVencimento:   number | null   = antes[0]?.dias_rel_vencimento     ?? null;
    const tipoPagamento = diasRelVencimento == null ? "novo"
                        : diasRelVencimento > 0     ? "atrasado"
                        : "adiantado";

    // statusFinal null = manter status; caso contrário seta o valor recebido
    const sql = `
UPDATE public.assinaturas
SET
  venc_contrato =
    CASE
      WHEN $2::date IS NOT NULL THEN $2::date
      WHEN venc_contrato::date >= CURRENT_DATE
        THEN (COALESCE(venc_contrato::date, CURRENT_DATE) + make_interval(months => $3))::date
      ELSE (CURRENT_DATE + make_interval(months => $3))::date
    END,
  venc_contas = CASE
    WHEN $5::date IS NOT NULL THEN $5::date
    ELSE venc_contas
  END,
  status = CASE
    WHEN $4::text IS NOT NULL THEN $4::text
    ELSE status
  END,
  observacao = CASE
    WHEN $6::boolean THEN NULLIF(btrim($7::text), '')
    ELSE observacao
  END,
  atualizado_em = NOW()
WHERE id_assinatura = $1::bigint
RETURNING id_assinatura::text, venc_contrato::text, venc_contas::text, status, id_cliente::text;
`;

    const result = await client.query(sql, [idAssinatura, dataManual, meses, statusFinal, vencContasManual, atualizarObservacao, observacao]);

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return { httpStatus: 404, corpo: { ok: false, error: `Assinatura ${idAssinatura} não encontrada` } };
    }

    const assinatura = result.rows[0];
    const vencContasNova: string | null = assinatura.venc_contas ?? null;

    // Registra pagamento somente se status = ativo
    let ehNovo = false;
    let idPagamento: string | null = null;
    if (registrarPagamento && pgto && statusFinal !== "pendente") {
      const idCliente = pgto.idCliente ?? assinatura.id_cliente;

      const { rows: ultPgto } = await client.query(
        `SELECT (CURRENT_DATE - data_pgto::date)::int AS dias
         FROM public.pagamentos
         WHERE id_cliente = $1::bigint
         ORDER BY data_pgto DESC NULLS LAST LIMIT 1`,
        [idCliente]
      );
      ehNovo = ultPgto.length === 0;
      const detalhes = ultPgto.length > 0 && ultPgto[0].dias != null
        ? `${parseInt(ultPgto[0].dias, 10)} dias desde o último pagamento`
        : "novo";

      const { rows: pgRows } = await client.query(
        `INSERT INTO public.pagamentos
         (id_cliente, cliente, compra, data_pgto, forma, valor, detalhes, tipo,
          tipo_pagamento, dias_relativo_vencimento, atualizado_em, id_assinatura)
         VALUES ($1::bigint, $2, $3, CURRENT_DATE, $4, $5::numeric, $6, 'Assinatura tv',
                 $7, $8, NOW(), $9::bigint)
         RETURNING id::text`,
        [idCliente, pgto.nomeCliente ?? null, pgto.pacoteNome ?? null,
         pgto.forma ?? "INTER", pgto.valor ?? 0, detalhes,
         tipoPagamento, diasRelVencimento, idAssinatura]
      );
      idPagamento = pgRows[0]?.id ?? null;
    }

    await registrarAudit(client, {
        usuario: usuarioAuditoria,
      tipo: "renovacao",
      id_cliente: assinatura.id_cliente,
      id_assinatura: idAssinatura,
      descricao: idPagamento
        ? `Renovação ${periodo} com pagamento #${idPagamento}`
        : assinatura.status === "pendente"
          ? `Renovação ${periodo} como pendente (sem pagamento)`
          : `Datas alteradas (${periodo}), sem pagamento`,
      dados_antes: {
        status: antes[0]?.status_anterior ?? null,
        venc_contrato: antes[0]?.venc_contrato_anterior ?? null,
        venc_contas: vencContasAnterior,
      },
      dados_depois: {
        status: assinatura.status,
        venc_contrato: assinatura.venc_contrato,
        venc_contas: vencContasNova,
        id_pagamento: idPagamento,
        valor: idPagamento ? pgto?.valor ?? null : null,
        forma: idPagamento ? pgto?.forma ?? "INTER" : null,
        ...origem,
      },
    });

    // Abate crédito em ambos os casos (ativo e pendente) — datas foram atualizadas
    await abaterCreditoRenovacao(client, idAssinatura, vencContasAnterior, vencContasNova);

    await client.query("COMMIT");

    let whatsapp = undefined;
    if (assinatura.status === "ativo") {
      const { rows: telasRows } = await pool.query(
        `SELECT p.telas, a.identificacao FROM public.assinaturas a JOIN public.planos p ON p.id_plano = a.id_plano WHERE a.id_assinatura = $1::bigint`,
        [idAssinatura]
      );
      whatsapp = await notificarRenovacao(assinatura.id_cliente, assinatura.venc_contrato, telasRows[0]?.telas ?? null, ehNovo, telasRows[0]?.identificacao ?? null);
    }

    return { httpStatus: 200, corpo: { ok: true, assinatura, whatsapp } };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
