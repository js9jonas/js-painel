// src/app/actions/clientes.ts
"use server";

import { pool } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function updateCliente(
  id: string,
  data: { nome: string; observacao: string | null }
) {
  if (!data.nome.trim()) throw new Error("Nome é obrigatório");

  await pool.query(
    `UPDATE public.clientes
     SET nome = $1, observacao = $2
     WHERE id_cliente = $3::bigint`,
    [data.nome.trim(), data.observacao?.trim() || null, id]
  );

  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id}`);
}
