// src/app/actions/pagamentos.ts
"use server";

import { pool } from "@/lib/db";
import { revalidatePath } from "next/cache";

type PagamentoData = {
  id_cliente: string | null;
  nome_cliente: string | null;
  data_pgto: string;
  forma: string;
  valor: string;
  detalhes: string;
  tipo: string;
  compra: string;
};

export async function updatePagamento(id: number, data: PagamentoData) {
  await pool.query(
    `UPDATE public.pagamentos
     SET
       id_cliente = $1,
       cliente    = $2,
       data_pgto  = $3,
       forma      = $4,
       valor      = $5,
       detalhes   = $6,
       tipo       = $7,
       compra     = $8
     WHERE id = $9`,
    [
      data.id_cliente ? BigInt(data.id_cliente) : null,
      data.nome_cliente?.trim() || null,
      data.data_pgto || null,
      data.forma.trim() || null,
      data.valor || null,
      data.detalhes.trim() || null,
      data.tipo.trim() || null,
      data.compra.trim() || null,
      id,
    ]
  );

  revalidatePath("/pagamentos");
  revalidatePath("/clientes");
}

export async function createPagamento(
  id_cliente: string,
  data: Omit<PagamentoData, "id_cliente" | "nome_cliente">
) {
  await pool.query(
    `INSERT INTO public.pagamentos (id_cliente, data_pgto, forma, valor, detalhes, tipo, compra)
     VALUES ($1::bigint, $2, $3, $4, $5, $6, $7)`,
    [
      id_cliente,
      data.data_pgto || null,
      data.forma.trim() || null,
      data.valor || null,
      data.detalhes.trim() || null,
      data.tipo.trim() || null,
      data.compra.trim() || null,
    ]
  );

  revalidatePath("/pagamentos");
  revalidatePath("/clientes");
  revalidatePath(`/clientes/${id_cliente}`);
}
