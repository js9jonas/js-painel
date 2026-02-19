// src/lib/planos.ts
import { pool } from "@/lib/db";

export type PlanoRow = {
  id_plano: string;
  tipo: string | null;
  telas: number | null;
  meses: number | null;
  valor: string | null;
  descricao: string | null;
};

export async function getPlanos(): Promise<PlanoRow[]> {
  const { rows } = await pool.query<PlanoRow>(`
    SELECT
      id_plano::text,
      tipo,
      telas::int,
      meses::int,
      valor::text,
      descricao
    FROM public.planos
    ORDER BY tipo ASC NULLS LAST, meses ASC NULLS LAST
  `);
  return rows;
}

export async function getPlanoById(id: string): Promise<PlanoRow | null> {
  const { rows } = await pool.query<PlanoRow>(
    `SELECT id_plano::text, tipo, telas::int, meses::int, valor::text, descricao
     FROM public.planos WHERE id_plano = $1::bigint LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}
