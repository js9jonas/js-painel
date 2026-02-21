// src/app/actions/novoCliente.ts
"use server";

import { pool } from "@/lib/db";
import { revalidatePath } from "next/cache";

export type NovoClienteData = {
  nome: string;
  observacao: string | null;
  criarAssinatura: boolean;
  id_pacote: string | null;
  id_plano: string | null;
  venc_contrato: string | null;
  venc_contas: string | null;
  status: string;
  identificacao: string | null;
  observacao_assinatura: string | null;
  telefone: string | null;
  nome_contato: string | null;
};

function normalizarNome(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export async function criarClienteComAssinatura(data: NovoClienteData): Promise<string> {
  if (!data.nome.trim()) throw new Error("Nome é obrigatório");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: clienteRows } = await client.query<{ id_cliente: string }>(
      `INSERT INTO public.clientes (nome, nome_norm, observacao)
       VALUES ($1, $2, $3)
       RETURNING id_cliente::text`,
      [data.nome.trim(), normalizarNome(data.nome), data.observacao?.trim() || null]
    );

    const id_cliente = clienteRows[0].id_cliente;

    if (data.telefone?.trim()) {
      await client.query(
        `INSERT INTO public.contatos (id_cliente, telefone, nome, criado_em, atualizado_em)
         VALUES ($1::bigint, $2, $3, NOW(), NOW())`,
        [id_cliente, data.telefone.trim(), data.nome_contato?.trim() || null]
      );
    }

    if (data.criarAssinatura) {
      await client.query(
        `INSERT INTO public.assinaturas
           (id_cliente, id_pacote, id_plano, venc_contrato, venc_contas,
            status, identificacao, observacao)
         VALUES ($1::bigint, $2, $3, $4::date, $5::date, $6, $7, $8)`,
        [
          id_cliente,
          data.id_pacote ? BigInt(data.id_pacote) : null,
          data.id_plano  ? BigInt(data.id_plano)  : null,
          data.venc_contrato || null,
          data.venc_contas   || null,
          data.status.trim() || "ativo",
          data.identificacao?.trim()         || null,
          data.observacao_assinatura?.trim() || null,
        ]
      );
    }

    await client.query("COMMIT");
    revalidatePath("/clientes");
    return id_cliente;

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}