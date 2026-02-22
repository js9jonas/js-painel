// src/app/actions/renovarConta.ts
"use server";

import { pool } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function adicionarMesConta(idAssinatura: string): Promise<void> {
  await pool.query(
    `UPDATE public.assinaturas
     SET venc_contas = (venc_contas::date + interval '1 month')::date,
         atualizado_em = NOW()
     WHERE id_assinatura = $1::bigint`,
    [idAssinatura]
  );
  revalidatePath("/alertas");
}