// src/app/actions/buscarClientes.ts
"use server";

import { pool } from "@/lib/db";

export type ClienteBuscaRow = {
  id_cliente: string;
  nome: string;
};

export async function buscarClientes(q: string): Promise<ClienteBuscaRow[]> {
  if (!q.trim()) return [];

  const { rows } = await pool.query<ClienteBuscaRow>(
    `SELECT id_cliente::text, nome
     FROM public.clientes
     WHERE nome ILIKE $1
     ORDER BY nome ASC
     LIMIT 10`,
    [`%${q.trim()}%`]
  );

  return rows;
}
