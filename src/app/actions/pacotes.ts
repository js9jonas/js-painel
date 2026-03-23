"use server";

import { pool } from "@/lib/db";

export async function createPacote(data: {
  contrato: string;
  telas: number;
}): Promise<string> {
  const { rows } = await pool.query<{ id_pacote: string }>(
    `INSERT INTO public.pacote (contrato, telas) VALUES ($1, $2) RETURNING id_pacote::text`,
    [data.contrato, data.telas]
  );
  return rows[0].id_pacote;
}

export async function updatePacote(
  id: string,
  data: { contrato: string; telas: number }
) {
  await pool.query(
    `UPDATE public.pacote SET contrato = $1, telas = $2 WHERE id_pacote = $3::bigint`,
    [data.contrato, data.telas, id]
  );
}