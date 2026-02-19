// src/app/actions/planos.ts
"use server";

import { pool } from "@/lib/db";
import { revalidatePath } from "next/cache";

type PlanoData = {
  tipo: string;
  telas: number;
  meses: number;
  valor: string;
  descricao: string;
};

export async function createPlano(data: PlanoData) {
  if (!data.tipo.trim()) throw new Error("Tipo é obrigatório");

  await pool.query(
    `INSERT INTO public.planos (tipo, telas, meses, valor, descricao)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      data.tipo.trim(),
      data.telas || null,
      data.meses || null,
      data.valor || null,
      data.descricao.trim() || null,
    ]
  );

  revalidatePath("/planos");
}

export async function updatePlano(id: string, data: PlanoData) {
  if (!data.tipo.trim()) throw new Error("Tipo é obrigatório");

  await pool.query(
    `UPDATE public.planos
     SET tipo = $1, telas = $2, meses = $3, valor = $4, descricao = $5
     WHERE id_plano = $6::bigint`,
    [
      data.tipo.trim(),
      data.telas || null,
      data.meses || null,
      data.valor || null,
      data.descricao.trim() || null,
      id,
    ]
  );

  revalidatePath("/planos");
}
