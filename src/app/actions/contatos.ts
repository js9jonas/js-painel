// src/app/actions/contatos.ts
"use server";

import { pool } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function addContato(
  id_cliente: string,
  telefone: string,
  nome?: string
) {
  if (!telefone.trim()) throw new Error("Telefone é obrigatório");

  await pool.query(
    `INSERT INTO public.contatos (id_cliente, telefone, nome, criado_em, atualizado_em)
     VALUES ($1::bigint, $2, $3, NOW(), NOW())`,
    [id_cliente, telefone.trim(), nome?.trim() || null]
  );

  revalidatePath(`/clientes/${id_cliente}`);
  revalidatePath("/clientes");
}

export async function updateContato(
  id_contato: string,
  id_cliente: string,
  telefone: string,
  nome?: string
) {
  if (!telefone.trim()) throw new Error("Telefone é obrigatório");

  await pool.query(
    `UPDATE public.contatos
     SET telefone = $1, nome = $2, atualizado_em = NOW()
     WHERE id_contato = $3::bigint`,
    [telefone.trim(), nome?.trim() || null, id_contato]
  );

  revalidatePath(`/clientes/${id_cliente}`);
  revalidatePath("/clientes");
}

export async function deleteContato(id_contato: string, id_cliente: string) {
  await pool.query(
    `DELETE FROM public.contatos WHERE id_contato = $1::bigint`,
    [id_contato]
  );

  revalidatePath(`/clientes/${id_cliente}`);
  revalidatePath("/clientes");
}
