// src/app/actions/assinaturas.ts
"use server";

import { pool } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { registrarAudit } from "@/lib/audit";

type AssinaturaUpdateData = {
  id_pacote: string | null;
  id_plano: string | null;
  venc_contrato: string | null;
  venc_contas: string | null;
  status: string;
  identificacao: string | null;
  observacao: string | null;
};

export async function updateAssinatura(
  id_assinatura: string,
  id_cliente: string,
  data: AssinaturaUpdateData
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: antes } = await client.query(
      `SELECT
         a.id_pacote::text,
         a.id_plano::text,
         a.status,
         a.venc_contrato::text,
         a.venc_contas::text,
         a.identificacao,
         a.observacao,
         p.contrato AS pacote_nome,
         pl.descricao AS plano_descricao
       FROM public.assinaturas a
       LEFT JOIN public.pacote  p  ON p.id_pacote = a.id_pacote
       LEFT JOIN public.planos  pl ON pl.id_plano  = a.id_plano
       WHERE a.id_assinatura = $1::bigint`,
      [id_assinatura]
    );

    const ant = antes[0];

    await client.query(
      `UPDATE public.assinaturas
       SET
         id_pacote     = $1,
         id_plano      = $2,
         venc_contrato = $3,
         venc_contas   = $4,
         status        = $5,
         identificacao = $6,
         observacao    = $7,
         atualizado_em = NOW()
       WHERE id_assinatura = $8::bigint`,
      [
        data.id_pacote ? BigInt(data.id_pacote) : null,
        data.id_plano  ? BigInt(data.id_plano)  : null,
        data.venc_contrato || null,
        data.venc_contas   || null,
        data.status.trim(),
        data.identificacao?.trim() || null,
        data.observacao?.trim()    || null,
        id_assinatura,
      ]
    );

    if (ant) {
      const pacoteNovo = data.id_pacote ?? null;
      const planoNovo  = data.id_plano  ?? null;
      const statusNovo = data.status.trim();

      if (ant.id_pacote !== pacoteNovo) {
        const { rows: novoP } = await client.query(
          `SELECT contrato FROM public.pacote WHERE id_pacote = $1`,
          [pacoteNovo]
        );
        await registrarAudit(client, {
          tipo: "troca_pacote",
          id_cliente,
          id_assinatura,
          descricao: `${ant.pacote_nome ?? ant.id_pacote} → ${novoP[0]?.contrato ?? pacoteNovo}`,
          dados_antes:  { id_pacote: ant.id_pacote,  pacote: ant.pacote_nome },
          dados_depois: { id_pacote: pacoteNovo,      pacote: novoP[0]?.contrato ?? null },
        });
      }

      if (ant.id_plano !== planoNovo) {
        const { rows: novoPlano } = await client.query(
          `SELECT descricao FROM public.planos WHERE id_plano = $1`,
          [planoNovo]
        );
        await registrarAudit(client, {
          tipo: "troca_plano",
          id_cliente,
          id_assinatura,
          descricao: `${ant.plano_descricao ?? ant.id_plano} → ${novoPlano[0]?.descricao ?? planoNovo}`,
          dados_antes:  { id_plano: ant.id_plano,  plano: ant.plano_descricao },
          dados_depois: { id_plano: planoNovo,      plano: novoPlano[0]?.descricao ?? null },
        });
      }

      if (ant.status !== statusNovo && statusNovo === "cancelado") {
        await registrarAudit(client, {
          tipo: "cancelamento",
          id_cliente,
          id_assinatura,
          descricao: `Status anterior: ${ant.status}`,
          dados_antes:  { status: ant.status },
          dados_depois: { status: statusNovo },
        });
      }

      const camposEditados: Record<string, { antes: string | null; depois: string | null }> = {};

      if (ant.status !== statusNovo && statusNovo !== "cancelado") {
        camposEditados.status = { antes: ant.status, depois: statusNovo };
      }
      if ((ant.venc_contrato ?? null) !== (data.venc_contrato || null)) {
        camposEditados.venc_contrato = { antes: ant.venc_contrato, depois: data.venc_contrato || null };
      }
      if ((ant.venc_contas ?? null) !== (data.venc_contas || null)) {
        camposEditados.venc_contas = { antes: ant.venc_contas, depois: data.venc_contas || null };
      }
      if ((ant.identificacao ?? null) !== (data.identificacao?.trim() || null)) {
        camposEditados.identificacao = { antes: ant.identificacao, depois: data.identificacao?.trim() || null };
      }
      if ((ant.observacao ?? null) !== (data.observacao?.trim() || null)) {
        camposEditados.observacao = { antes: ant.observacao, depois: data.observacao?.trim() || null };
      }

      if (Object.keys(camposEditados).length > 0) {
        const campos = Object.keys(camposEditados).join(", ");
        await registrarAudit(client, {
          tipo: "edicao_cadastro",
          id_cliente,
          id_assinatura,
          descricao: `Campos alterados: ${campos}`,
          dados_antes:  Object.fromEntries(Object.entries(camposEditados).map(([k, v]) => [k, v.antes])),
          dados_depois: Object.fromEntries(Object.entries(camposEditados).map(([k, v]) => [k, v.depois])),
        });
      }
    }

    await client.query("COMMIT");
    revalidatePath(`/clientes/${id_cliente}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteAssinatura(
  id_assinatura: string,
  id_cliente: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: vinc } = await client.query(
      `SELECT
         (SELECT COUNT(*) FROM public.pagamentos  WHERE id_assinatura = $1::bigint)::int AS pagamentos,
         (SELECT COUNT(*) FROM public.contas      WHERE id_assinatura = $1::bigint)::int AS contas,
         (SELECT COUNT(*) FROM public.aplicativos WHERE id_assinatura = $1::bigint)::int AS aplicativos`,
      [id_assinatura]
    );
    const { pagamentos, contas, aplicativos } = vinc[0];

    if (pagamentos > 0 || contas > 0 || aplicativos > 0) {
      await client.query("ROLLBACK");
      const partes: string[] = [];
      if (pagamentos > 0) partes.push(`${pagamentos} pagamento(s)`);
      if (contas > 0) partes.push(`${contas} conta(s)`);
      if (aplicativos > 0) partes.push(`${aplicativos} aplicativo(s)`);
      return {
        ok: false,
        error: `Não é possível excluir: assinatura tem ${partes.join(", ")} vinculado(s). Remova esses vínculos antes.`,
      };
    }

    // Sem pagamentos/contas/aplicativos vinculados — seguro excluir. Limpa histórico de auditoria
    // (só registra edições da própria assinatura que está sendo removida, não há motivo pra manter órfão).
    await client.query(`DELETE FROM public.audit_log WHERE id_assinatura = $1::bigint`, [id_assinatura]);
    await client.query(`DELETE FROM public.saldo_servidor_historico WHERE id_assinatura = $1::bigint`, [id_assinatura]);

    const { rowCount } = await client.query(
      `DELETE FROM public.assinaturas WHERE id_assinatura = $1::bigint`,
      [id_assinatura]
    );
    if (rowCount === 0) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Assinatura não encontrada." };
    }

    await client.query("COMMIT");
    revalidatePath(`/clientes/${id_cliente}`);
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    return { ok: false, error: err instanceof Error ? err.message : "Erro ao excluir assinatura." };
  } finally {
    client.release();
  }
}
