// src/app/api/assinaturas/[id]/renovar/route.ts
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { abaterCreditoRenovacao } from "@/lib/saldoServidor";

type Periodo = "mensal" | "trimestral" | "semestral" | "anual";

function mesesDoPeriodo(p: Periodo) {
  switch (p) {
    case "trimestral": return 3;
    case "semestral": return 6;
    case "anual": return 12;
    default: return 1;
  }
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await ctx.params;
    const idAssinatura = String(rawId).trim();

    const body = await req.json().catch(() => ({}));

    const periodo: Periodo = body?.periodo ?? "mensal";
    const meses = mesesDoPeriodo(periodo);
    const dataManual = typeof body?.dataManual === "string" && body.dataManual.trim()
      ? body.dataManual.trim() : null;
    const registrarPagamento = body?.registrarPagamento === true;
    const pgto = body?.pagamento ?? null;
    const vencContasManual = typeof body?.vencContasManual === "string" && body.vencContasManual.trim()
      ? body.vencContasManual.trim() : null;
    const soPagamento = body?.soPagamento === true;

    // statusFinal: "ativo" | "pendente" | null (null = manter status atual)
    const statusFinal: "ativo" | "pendente" | null = body?.statusFinal ?? null;

    const client = await pool.connect();

    // Modo soPagamento (assinatura já pendente — só registra pagamento e ativa)
    if (soPagamento) {
      try {
        await client.query("BEGIN");

        // Captura venc_contrato antes de ativar para calcular tipo_pagamento.
        // Como a assinatura estava pendente, venc_contrato já foi avançado um ciclo
        // na renovação anterior. Subtraímos o período para obter o vencimento original.
        const { rows: vcRows } = await client.query(
          `SELECT (CURRENT_DATE - (venc_contrato - make_interval(months => $2::int))::date)::int AS dias_rel, venc_contrato
           FROM public.assinaturas WHERE id_assinatura = $1::bigint`,
          [idAssinatura, meses]
        );
        const diasRelSoPag: number | null = vcRows[0]?.dias_rel ?? null;
        const tipoPagSoPag =
          diasRelSoPag == null ? "novo"
          : diasRelSoPag > 0   ? "atrasado"
          : "adiantado";

        await client.query(
          `UPDATE public.assinaturas SET status = 'ativo', atualizado_em = NOW() WHERE id_assinatura = $1::bigint`,
          [idAssinatura]
        );

        if (registrarPagamento && pgto) {
          const idCliente = pgto.idCliente;

          const { rows: ultPgto } = await client.query(
            `SELECT (CURRENT_DATE - data_pgto::date)::int AS dias
             FROM public.pagamentos
             WHERE id_cliente = $1::bigint
             ORDER BY data_pgto DESC NULLS LAST LIMIT 1`,
            [idCliente]
          );
          const detalhes = ultPgto.length > 0 && ultPgto[0].dias != null
            ? `${parseInt(ultPgto[0].dias, 10)} dias desde o último pagamento`
            : "novo";

          await client.query(
            `INSERT INTO public.pagamentos
             (id_cliente, cliente, compra, data_pgto, forma, valor, detalhes, tipo,
              tipo_pagamento, dias_relativo_vencimento, atualizado_em)
             VALUES ($1::bigint, $2, $3, CURRENT_DATE, $4, $5::numeric, $6, 'Assinatura tv',
                     $7, $8, NOW())`,
            [idCliente, pgto.nomeCliente ?? null, pgto.pacoteNome ?? null,
             pgto.forma ?? "PIX", pgto.valor ?? 0, detalhes,
             tipoPagSoPag, diasRelSoPag]
          );
        }

        await client.query("COMMIT");
        return NextResponse.json({ ok: true });
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
           (CURRENT_DATE - venc_contrato)::int AS dias_rel_vencimento
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
    atualizado_em = NOW()
  WHERE id_assinatura = $1::bigint
  RETURNING id_assinatura::text, venc_contrato::text, venc_contas::text, status, id_cliente::text;
`;

      const result = await client.query(sql, [idAssinatura, dataManual, meses, statusFinal, vencContasManual]);

      if (result.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: `Assinatura ${idAssinatura} não encontrada` }, { status: 404 });
      }

      const assinatura = result.rows[0];
      const vencContasNova: string | null = assinatura.venc_contas ?? null;

      // Registra pagamento somente se status = ativo
      if (registrarPagamento && pgto && statusFinal !== "pendente") {
        const idCliente = pgto.idCliente ?? assinatura.id_cliente;

        const { rows: ultPgto } = await client.query(
          `SELECT (CURRENT_DATE - data_pgto::date)::int AS dias
           FROM public.pagamentos
           WHERE id_cliente = $1::bigint
           ORDER BY data_pgto DESC NULLS LAST LIMIT 1`,
          [idCliente]
        );
        const detalhes = ultPgto.length > 0 && ultPgto[0].dias != null
          ? `${parseInt(ultPgto[0].dias, 10)} dias desde o último pagamento`
          : "novo";

        await client.query(
          `INSERT INTO public.pagamentos
           (id_cliente, cliente, compra, data_pgto, forma, valor, detalhes, tipo,
            tipo_pagamento, dias_relativo_vencimento, atualizado_em)
           VALUES ($1::bigint, $2, $3, CURRENT_DATE, $4, $5::numeric, $6, 'Assinatura tv',
                   $7, $8, NOW())`,
          [idCliente, pgto.nomeCliente ?? null, pgto.pacoteNome ?? null,
           pgto.forma ?? "PIX", pgto.valor ?? 0, detalhes,
           tipoPagamento, diasRelVencimento]
        );
      }

      // Abate crédito em ambos os casos (ativo e pendente) — datas foram atualizadas
      await abaterCreditoRenovacao(client, idAssinatura, vencContasAnterior, vencContasNova);

      await client.query("COMMIT");
      return NextResponse.json({ ok: true, assinatura });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("Erro ao renovar assinatura:", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Erro interno" }, { status: 500 });
  }
}