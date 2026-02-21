// src/lib/aplicativos.ts
import { pool } from "@/lib/db";

export type AppRow = {
  id_app: string;
  nome_app: string;
  exige_licenca: boolean;
  observacao: string | null;
  url_referencia: string | null;
};

export type AplicativoRow = {
  id_app_registro: number;
  id_cliente: number;
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
  data_cadastro: string | null;
  atualizado_em: string | null;
};

export async function getAplicativosByClienteId(id_cliente: string): Promise<AplicativoRow[]> {
  const { rows } = await pool.query<AplicativoRow>(
    `SELECT
       ap.id_app_registro,
       ap.id_cliente,
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
       ap.id_dispositivo,
       ap.data_cadastro::text,
       ap.atualizado_em::text
     FROM public.aplicativos ap
     LEFT JOIN public.apps a ON a.id_app = ap.id_app
     WHERE ap.id_cliente = $1::int
     ORDER BY ap.atualizado_em DESC NULLS LAST, ap.id_app_registro DESC`,
    [id_cliente]
  );
  return rows;
}

export async function getApps(): Promise<AppRow[]> {
  const { rows } = await pool.query<AppRow>(
    `SELECT id_app::text, nome_app, exige_licenca, observacao, url_referencia
     FROM public.apps
     ORDER BY nome_app ASC`
  );
  return rows;
}
