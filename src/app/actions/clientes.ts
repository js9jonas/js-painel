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

export type ContatoRow = {
  id_contato: string;
  telefone: string;
  nome: string | null;
  referencia: string | null;
};

export async function getContatosCliente(idCliente: string): Promise<ContatoRow[]> {
  const { rows } = await pool.query<ContatoRow>(
    `SELECT id_contato::text, telefone, nome, referencia
     FROM public.contatos
     WHERE id_cliente = $1::bigint
     ORDER BY criado_em ASC`,
    [idCliente]
  );
  return rows;
}

export async function salvarContato(
  idCliente: string,
  data: { idContato?: string; telefone: string; nome: string | null; referencia: string | null }
): Promise<void> {
  if (data.idContato) {
    await pool.query(
      `UPDATE public.contatos
       SET telefone = $1, nome = $2, referencia = $3, atualizado_em = NOW()
       WHERE id_contato = $4::bigint`,
      [data.telefone.trim(), data.nome?.trim() || null, data.referencia?.trim() || null, data.idContato]
    );
  } else {
    await pool.query(
      `INSERT INTO public.contatos (id_cliente, telefone, nome, referencia, criado_em, atualizado_em)
       VALUES ($1::bigint, $2, $3, $4, NOW(), NOW())`,
      [idCliente, data.telefone.trim(), data.nome?.trim() || null, data.referencia?.trim() || null]
    );
  }
  revalidatePath(`/clientes/${idCliente}`);
}

export async function deletarContato(idContato: string, idCliente: string): Promise<void> {
  await pool.query(
    `DELETE FROM public.contatos WHERE id_contato = $1::bigint`,
    [idContato]
  );
  revalidatePath(`/clientes/${idCliente}`);
}