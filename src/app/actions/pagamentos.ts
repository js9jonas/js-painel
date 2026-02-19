// src/app/actions/pagamentos.ts
"use server";

import { pool } from "@/lib/db";
import { revalidatePath } from "next/cache";

type PagamentoData = {
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
     SET data_pgto = $1, forma = $2, valor = $3, detalhes = $4, tipo = $5, compra = $6
     WHERE id = $7`,
    [
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
  data: PagamentoData
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
