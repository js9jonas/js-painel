// src/lib/pacotes.ts
import { pool } from "@/lib/db";

export type PacoteRow = {
  id_pacote: string;
  contrato: string | null;
  telas: number | null;
};

export async function getPacotes(): Promise<PacoteRow[]> {
  const { rows } = await pool.query<PacoteRow>(`
    SELECT id_pacote::text, contrato, telas::int
    FROM public.pacote
    ORDER BY contrato ASC NULLS LAST
  `);
  return rows;
}