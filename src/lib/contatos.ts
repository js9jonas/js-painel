// src/lib/contatos.ts
import { pool } from "@/lib/db";

export type ContatoRow = {
  id_contato: string;
  id_cliente: string;
  telefone: string | null;
  nome: string | null;
  referencia: string | null;
  criado_em: string | null;
  atualizado_em: string | null;
};

export async function getContatosByClienteId(id: string): Promise<ContatoRow[]> {
  const { rows } = await pool.query<ContatoRow>(
    `SELECT
       id_contato::text,
       id_cliente::text,
       telefone,
       nome,
       referencia,
       criado_em::text,
       atualizado_em::text
     FROM public.contatos
     WHERE id_cliente = $1::bigint
     ORDER BY atualizado_em DESC NULLS LAST, criado_em DESC NULLS LAST, id_contato ASC`,
    [id]
  );
  return rows;
}
