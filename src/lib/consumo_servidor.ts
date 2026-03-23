import { pool } from "@/lib/db";

export type ConsumoRow = {
  id_consumo_servidor: string;
  id_pacote: string;
  id_servidor: string;
  creditos_mensal: number;
};

export async function getAllConsumos(): Promise<ConsumoRow[]> {
  const { rows } = await pool.query<ConsumoRow>(`
    SELECT id_consumo_servidor::text, id_pacote::text, id_servidor::text, creditos_mensal
    FROM public.consumo_servidor
  `);
  return rows;
}