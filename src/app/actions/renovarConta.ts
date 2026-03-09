"use server";

import { pool } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function adicionarMesConta(idAssinatura: string): Promise<void> {
  // Verifica se a assinatura é de plano cortesia
  const { rows } = await pool.query(
    `SELECT pl.tipo
     FROM public.assinaturas a
     LEFT JOIN public.planos pl ON pl.id_plano = a.id_plano
     WHERE a.id_assinatura = $1::bigint`,
    [idAssinatura]
  );

  const isCortesia = rows[0] && rows[0].tipo?.toLowerCase().trim() === "cortesia";

  if (isCortesia) {
    // Cortesia: avança venc_contas e venc_contrato juntos
    await pool.query(
      `UPDATE public.assinaturas
       SET venc_contas   = (venc_contas::date   + interval '1 month')::date,
           venc_contrato = (venc_contrato::date + interval '1 month')::date,
           atualizado_em = NOW()
       WHERE id_assinatura = $1::bigint`,
      [idAssinatura]
    );
  } else {
    // Normal: só avança venc_contas
    await pool.query(
      `UPDATE public.assinaturas
       SET venc_contas = (venc_contas::date + interval '1 month')::date,
           atualizado_em = NOW()
       WHERE id_assinatura = $1::bigint`,
      [idAssinatura]
    );
  }

  revalidatePath("/alertas");
}