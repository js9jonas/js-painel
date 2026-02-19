// src/app/actions/assinaturas.ts
"use server";

import { pool } from "@/lib/db";
import { revalidatePath } from "next/cache";

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
  await pool.query(
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

  revalidatePath(`/clientes/${id_cliente}`);
}
