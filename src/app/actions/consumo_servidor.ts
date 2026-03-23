"use server";

import { pool } from "@/lib/db";

export async function saveConsumos(
  id_pacote: string,
  entries: { id_servidor: string; creditos_mensal: number }[]
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM public.consumo_servidor WHERE id_pacote = $1::bigint`,
      [id_pacote]
    );
    for (const e of entries) {
      if (e.creditos_mensal > 0) {
        await client.query(
          `INSERT INTO public.consumo_servidor (id_pacote, id_servidor, creditos_mensal)
           VALUES ($1::bigint, $2::bigint, $3)`,
          [id_pacote, e.id_servidor, e.creditos_mensal]
        );
      }
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}