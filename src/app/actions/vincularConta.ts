"use server";

import { pool } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function vincularConta(idConta: number, idCliente: number) {
  // Insere em aplicativos ligando cliente ↔ conta do painel
  await pool.query(
    `INSERT INTO public.aplicativos (id_cliente, id_conta, status)
     VALUES ($1, $2, 'ativa')
     ON CONFLICT DO NOTHING`,
    [idCliente, idConta]
  );
  revalidatePath("/servidores/vinculacao");
}

export async function desvincularConta(idConta: number) {
  await pool.query(
    `DELETE FROM public.aplicativos WHERE id_conta = $1`,
    [idConta]
  );
  revalidatePath("/servidores/vinculacao");
}
