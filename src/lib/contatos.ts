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

/**
 * Verifica se um telefone já pertence a outro cliente (constraint ux_contatos_telefone_global
 * garante isso no banco; essa função existe pra dar uma mensagem amigável ANTES de tentar
 * gravar, em vez de deixar o usuário esbarrar num erro cru de constraint).
 * Ignora o placeholder '0000000000' (não é telefone real).
 * `excluirIdCliente` evita falso positivo ao editar/adicionar contato do próprio cliente.
 */
export async function buscarDonoDoTelefone(
  telefone: string,
  excluirIdCliente?: string
): Promise<{ id_cliente: string; nome: string } | null> {
  const tel = telefone.trim();
  if (!tel || tel === "0000000000") return null;

  const { rows } = await pool.query<{ id_cliente: string; nome: string }>(
    `SELECT c.id_cliente::text, cl.nome
     FROM public.contatos c
     JOIN public.clientes cl ON cl.id_cliente = c.id_cliente
     WHERE c.telefone = $1
       ${excluirIdCliente ? "AND c.id_cliente <> $2::bigint" : ""}
     LIMIT 1`,
    excluirIdCliente ? [tel, excluirIdCliente] : [tel]
  );
  return rows[0] ?? null;
}

export function erroTelefoneDuplicado(dono: { id_cliente: string; nome: string }): Error {
  return new Error(
    `Esse telefone já pertence ao cliente "${dono.nome}" (id ${dono.id_cliente}). ` +
    `Se for a mesma pessoa/família, adicione uma assinatura a esse cliente em vez de criar um novo.`
  );
}

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
