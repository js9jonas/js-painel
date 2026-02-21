// src/app/actions/inserirAssinatura.ts
"use server";

import { pool } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type InserirAssinaturaData = {
  id_pacote: string | null;
  id_plano: string | null;
  venc_contrato: string | null;
  venc_contas: string | null;
  status: string;
  identificacao: string | null;
  observacao: string | null;
};

export async function inserirAssinatura(
  id_cliente: string,
  data: InserirAssinaturaData
): Promise<void> {
  if (!id_cliente) throw new Error("ID do cliente é obrigatório");

  await pool.query(
    `INSERT INTO public.assinaturas
       (id_cliente, id_pacote, id_plano, venc_contrato, venc_contas,
        status, identificacao, observacao)
     VALUES
       ($1::bigint, $2, $3, $4::date, $5::date, $6, $7, $8)`,
    [
      id_cliente,
      data.id_pacote ? BigInt(data.id_pacote) : null,
      data.id_plano  ? BigInt(data.id_plano)  : null,
      data.venc_contrato || null,
      data.venc_contas   || null,
      data.status.trim() || "ativo",
      data.identificacao?.trim() || null,
      data.observacao?.trim()    || null,
    ]
  );

  revalidatePath(`/clientes/${id_cliente}`);
}