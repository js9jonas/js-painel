import { pool } from "@/lib/db";

export type ServidorRow = {
  id_servidor: string;
  codigo_publico: string;
  nome_interno: string;
  ativo: boolean;
};

export async function getServidores(): Promise<ServidorRow[]> {
  const { rows } = await pool.query<ServidorRow>(`
    SELECT id_servidor::text, codigo_publico, nome_interno, ativo
    FROM public.servidores
    ORDER BY nome_interno ASC
  `);
  return rows;
}