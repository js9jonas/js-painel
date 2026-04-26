"use server";

import { pool } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function vincularConta(idConta: number, idCliente: number) {
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

export async function autoVincularSugeridos(): Promise<{ vinculados: number }> {
  const { rowCount } = await pool.query(`
    INSERT INTO public.aplicativos (id_cliente, id_conta, status)
    SELECT cl.id_cliente, c.id_conta, 'ativa'
    FROM public.contas c
    JOIN public.clientes cl ON lower(cl.nome) = lower(c.rotulo)
    LEFT JOIN public.aplicativos a ON a.id_conta = c.id_conta
    WHERE a.id_conta IS NULL
      AND c.rotulo IS NOT NULL
      AND c.rotulo != ''
    AND (
      SELECT COUNT(*) FROM public.clientes cl2
      WHERE lower(cl2.nome) = lower(c.rotulo)
    ) = 1
    ON CONFLICT DO NOTHING
  `);
  revalidatePath("/servidores/vinculacao");
  return { vinculados: rowCount ?? 0 };
}
