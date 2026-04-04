"use server";

import { pool } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { abaterCreditoRenovacao } from "@/lib/saldoServidor";

export async function definirDataConta(
  idAssinatura: string,
  novaData: string // formato YYYY-MM-DD
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: antes } = await client.query(
      `SELECT pl.tipo, a.venc_contas::text AS venc_contas_anterior
       FROM public.assinaturas a
       LEFT JOIN public.planos pl ON pl.id_plano = a.id_plano
       WHERE a.id_assinatura = $1::bigint`,
      [idAssinatura]
    );

    const isCortesia = antes[0]?.tipo?.toLowerCase().trim() === "cortesia";
    const vencContasAnterior: string | null = antes[0]?.venc_contas_anterior ?? null;

    let vencContasNova: string | null = null;

    if (isCortesia) {
      const diffMs =
        new Date(novaData).getTime() - new Date(vencContasAnterior!).getTime();
      const diffDias = Math.round(diffMs / (1000 * 60 * 60 * 24));

      const { rows } = await client.query(
        `UPDATE public.assinaturas
         SET venc_contas   = $2::date,
             venc_contrato = (venc_contrato::date + ($3 || ' days')::interval)::date,
             atualizado_em = NOW()
         WHERE id_assinatura = $1::bigint
         RETURNING venc_contas::text AS venc_contas_nova`,
        [idAssinatura, novaData, diffDias]
      );
      vencContasNova = rows[0]?.venc_contas_nova ?? null;
    } else {
      const { rows } = await client.query(
        `UPDATE public.assinaturas
         SET venc_contas   = $2::date,
             atualizado_em = NOW()
         WHERE id_assinatura = $1::bigint
         RETURNING venc_contas::text AS venc_contas_nova`,
        [idAssinatura, novaData]
      );
      vencContasNova = rows[0]?.venc_contas_nova ?? null;
    }

    await abaterCreditoRenovacao(client, idAssinatura, vencContasAnterior, vencContasNova);

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  revalidatePath("/alertas");
}