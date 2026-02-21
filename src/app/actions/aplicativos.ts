// src/app/actions/aplicativos.ts
"use server";

import { pool } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type AplicativoData = {
  id_cliente: string | null;
  id_app: string | null;
  mac: string | null;
  chave: string | null;
  validade: string | null;
  status: string;
  observacao: string | null;
  id_assinatura: string | null;
  id_conta: string | null;
  id_dispositivo: string | null;
};

export async function createAplicativo(id_cliente: string, data: AplicativoData) {
  await pool.query(
    `INSERT INTO public.aplicativos
   (id_cliente, id_app, mac, chave, validade, status, observacao,
    id_assinatura, id_conta, id_dispositivo, data_cadastro, atualizado_em)
 VALUES ($1::int, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, NOW(), NOW())`,
    [
      id_cliente,
      data.id_app ? parseInt(data.id_app) : null,
      data.mac?.trim() || null,
      data.chave?.trim() || null,
      data.validade || null,
      data.status.trim() || "ativo",
      data.observacao?.trim() || null,
      data.id_assinatura ? parseInt(data.id_assinatura) : null,
      data.id_conta ? parseInt(data.id_conta) : null,
      data.id_dispositivo ? parseInt(data.id_dispositivo) : null,
    ]
  );

  revalidatePath(`/clientes/${id_cliente}`);
}

export async function updateAplicativo(
  id_app_registro: number,
  id_cliente: string,
  data: AplicativoData
) {
  await pool.query(
    `UPDATE public.aplicativos
 SET
   id_cliente     = $1,
   id_app         = $2,
   mac            = $3,
   chave          = $4,
   validade       = $5::date,
   status         = $6,
   observacao     = $7,
   id_assinatura  = $8,
   id_conta       = $9,
   id_dispositivo = $10,
   atualizado_em  = NOW()
 WHERE id_app_registro = $11`,
    [
      data.id_cliente ? parseInt(data.id_cliente) : null,
      data.id_app ? parseInt(data.id_app) : null,
      data.mac?.trim() || null,
      data.chave?.trim() || null,
      data.validade || null,
      data.status.trim() || "ativo",
      data.observacao?.trim() || null,
      data.id_assinatura ? parseInt(data.id_assinatura) : null,
      data.id_conta ? parseInt(data.id_conta) : null,
      data.id_dispositivo ? parseInt(data.id_dispositivo) : null,
      id_app_registro,
    ]
  );

  revalidatePath(`/clientes/${id_cliente}`);
  revalidatePath(`/aplicativos`);
}

export async function deleteAplicativo(id_app_registro: number, id_cliente: string) {
  await pool.query(
    `DELETE FROM public.aplicativos WHERE id_app_registro = $1`,
    [id_app_registro]
  );

  revalidatePath(`/clientes/${id_cliente}`);
}