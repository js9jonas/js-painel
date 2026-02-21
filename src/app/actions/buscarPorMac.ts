"use server";

import { pool } from "@/lib/db";

export type ResultadoMac = {
  id_app_registro: number;
  id_cliente: string | null;
  nome_cliente: string | null;
  id_app: number | null;
  nome_app: string | null;
  exige_licenca: boolean | null;
  mac: string | null;
  chave: string | null;
  validade: string | null;
  status: string | null;
  observacao: string | null;
  id_assinatura: number | null;
  id_conta: number | null;
  id_dispositivo: number | null;
};

export async function buscarPorMac(mac: string): Promise<ResultadoMac[]> {
  if (!mac.trim()) return [];

  const { rows } = await pool.query<ResultadoMac>(
    `SELECT
       ap.id_app_registro,
       ap.id_cliente::text,
       c.nome AS nome_cliente,
       ap.id_app,
       a.nome_app,
       a.exige_licenca,
       ap.mac,
       ap.chave,
       to_char(ap.validade, 'YYYY-MM-DD') AS validade,
       ap.status,
       ap.observacao,
       ap.id_assinatura,
       ap.id_conta,
       ap.id_dispositivo
     FROM public.aplicativos ap
     LEFT JOIN public.clientes c ON c.id_cliente = ap.id_cliente
     LEFT JOIN public.apps a ON a.id_app = ap.id_app
     WHERE ap.mac ILIKE $1
     ORDER BY ap.atualizado_em DESC NULLS LAST
     LIMIT 20`,
    [`%${mac.trim()}%`]
  );

  return rows;
}