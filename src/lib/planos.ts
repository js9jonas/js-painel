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
    ORDER BY
      CASE tipo
        WHEN 'Padrão'   THEN 1
        WHEN 'Promo'    THEN 2
        WHEN 'Especial' THEN 3
        WHEN 'VIP'      THEN 4
        WHEN 'Slim'     THEN 5
        WHEN 'Cortesia' THEN 6
        ELSE 7
      END,
      telas ASC NULLS LAST,
      meses ASC NULLS LAST
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
