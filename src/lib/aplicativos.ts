// src/lib/aplicativos.ts
import { pool } from "@/lib/db";

export type AppRow = {
  id_app: string;
  nome_app: string;
  exige_licenca: boolean;
  observacao: string | null;
  url_referencia: string | null;
};

export type PlaylistRow = {
  id: number;
  playlist_id_externo: number | null;
  nome: string | null;
  url: string | null;
  is_selected: boolean;
  expired_date: string | null;
  id_conta: number | null;
  usuario_conta: string | null;
  venc_real_conta: string | null;
  status_conta: string | null;
};

export type AplicativoRow = {
  id_app_registro: number;
  id_cliente: number;
  id_app: number | null;
  nome_app: string | null;
  exige_licenca: boolean | null;
  mac: string | null;
  chave: string | null;
  modelo: string | null;
  validade: string | null;
  status: string | null;
  observacao: string | null;
  id_assinatura: number | null;
  id_conta: number | null;
  id_dispositivo: number | null;
  id_painel_servidor: number | null;
  data_cadastro: string | null;
  atualizado_em: string | null;
  playlists: PlaylistRow[];
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
       ap.modelo,
       to_char(ap.validade, 'YYYY-MM-DD') AS validade,
       ap.status,
       ap.observacao,
       ap.id_assinatura,
       ap.id_conta,
       ap.id_dispositivo,
       ap.id_painel_servidor,
       ap.data_cadastro::text,
       ap.atualizado_em::text,
       COALESCE(
         JSON_AGG(
           JSON_BUILD_OBJECT(
             'id', pl.id,
             'playlist_id_externo', pl.playlist_id_externo,
             'nome', pl.nome,
             'url', pl.url,
             'is_selected', pl.is_selected,
             'expired_date', pl.expired_date::text,
             'id_conta', pl.id_conta,
             'usuario_conta', c.usuario,
             'venc_real_conta', to_char(c.vencimento_real_painel, 'YYYY-MM-DD'),
             'status_conta', c.status_conta
           ) ORDER BY pl.is_selected DESC, pl.id ASC
         ) FILTER (WHERE pl.id IS NOT NULL),
         '[]'
       ) AS playlists
     FROM public.aplicativos ap
     LEFT JOIN public.apps a ON a.id_app = ap.id_app
     LEFT JOIN public.aplicativo_playlists pl ON pl.id_app_registro = ap.id_app_registro
     LEFT JOIN public.contas c ON c.id_conta = pl.id_conta
     WHERE ap.id_cliente = $1::int
     GROUP BY ap.id_app_registro, a.nome_app, a.exige_licenca
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
