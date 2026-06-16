import { pool } from "@/lib/db";

export type PainelServidorRow = {
  id: number;
  nome: string;
  tipo: string;
  url_painel: string | null;
  url_api: string | null;
  usuario: string | null;
  master: string | null;
  contato_master: string | null;
  padrao_usuario: string | null;
  padrao_senha: string | null;
  ativo: boolean;
  tem_session: boolean;
  session_expiry: Date | null;
  tem_api_token: boolean;
  total_contas: number;
  contas_pendentes: number;
  contas_confirmadas: number;
  id_servidor: number | null;
};

export type ServidorVinculoRow = {
  id_servidor: number;
  codigo_publico: string;
  nome_interno: string;
};

export type PainelAppRow = {
  id: number;
  nome: string;
  tipo: string;
  url_painel: string | null;
  master: string | null;
  contato_master: string | null;
  modo_acesso: "coletivo" | "individual";
  ativo: boolean;
};

export async function getPainelServidores(): Promise<PainelServidorRow[]> {
  const { rows } = await pool.query<PainelServidorRow>(`
    SELECT
      ps.id,
      ps.nome,
      ps.tipo,
      ps.url_painel,
      ps.url_api,
      ps.usuario,
      ps.master,
      ps.contato_master,
      ps.padrao_usuario,
      ps.padrao_senha,
      ps.ativo,
      (ps.session_cookie IS NOT NULL) AS tem_session,
      ps.session_expiry,
      (ps.api_token IS NOT NULL)      AS tem_api_token,
      COUNT(c.id_conta)::int          AS total_contas,
      COUNT(c.id_conta) FILTER (WHERE c.status_sinc = 'pendente')::int   AS contas_pendentes,
      COUNT(c.id_conta) FILTER (WHERE c.status_sinc = 'confirmado')::int AS contas_confirmadas,
      ps.id_servidor
    FROM public.painel_servidores ps
    LEFT JOIN public.contas c ON c.id_painel_servidor = ps.id AND c.removido_em IS NULL
    WHERE ps.tipo NOT IN ('funplays', 'lazerplay', 'coreplayer')
    GROUP BY ps.id
    ORDER BY ps.nome
  `);
  return rows;
}

export async function getServidoresParaVinculo(): Promise<ServidorVinculoRow[]> {
  const { rows } = await pool.query<ServidorVinculoRow>(`
    SELECT id_servidor, codigo_publico, nome_interno
    FROM public.servidores
    WHERE ativo = true
    ORDER BY codigo_publico
  `);
  return rows;
}

export async function getPainelApps(): Promise<PainelAppRow[]> {
  const { rows } = await pool.query<PainelAppRow>(`
    SELECT id, nome, tipo, url_painel, master, contato_master, modo_acesso, ativo
    FROM public.painel_apps
    ORDER BY nome
  `);
  return rows;
}

export type PainelAppSyncRow = PainelServidorRow & {
  total_devices: number;
  devices_vinculados: number;
  total_playlists: number;
  playlists_vinculadas: number;
};

export async function getPainelAppSync(): Promise<PainelAppSyncRow[]> {
  const { rows } = await pool.query<PainelAppSyncRow>(`
    SELECT
      ps.id,
      ps.nome,
      ps.tipo,
      ps.url_painel,
      ps.url_api,
      ps.usuario,
      ps.master,
      ps.contato_master,
      ps.padrao_usuario,
      ps.padrao_senha,
      ps.ativo,
      (ps.session_cookie IS NOT NULL) AS tem_session,
      ps.session_expiry,
      (ps.api_token IS NOT NULL)      AS tem_api_token,
      ps.id_servidor,
      0::int AS total_contas,
      0::int AS contas_pendentes,
      0::int AS contas_confirmadas,
      COUNT(DISTINCT ap.id_app_registro)::int AS total_devices,
      COUNT(DISTINCT ap.id_app_registro) FILTER (WHERE ap.id_cliente IS NOT NULL)::int AS devices_vinculados,
      COUNT(pl.id)::int AS total_playlists,
      COUNT(pl.id) FILTER (WHERE pl.id_conta IS NOT NULL)::int AS playlists_vinculadas
    FROM public.painel_servidores ps
    LEFT JOIN public.aplicativos ap ON ap.id_painel_servidor = ps.id
    LEFT JOIN public.aplicativo_playlists pl ON pl.id_app_registro = ap.id_app_registro
    WHERE ps.tipo IN ('funplays', 'lazerplay', 'coreplayer')
    GROUP BY ps.id
    ORDER BY ps.nome
  `);
  return rows;
}

export async function getPainelServidorById(id: number): Promise<PainelServidorRow | null> {
  const { rows } = await pool.query<PainelServidorRow>(`
    SELECT
      ps.id, ps.nome, ps.tipo, ps.url_painel, ps.url_api, ps.usuario,
      ps.master, ps.contato_master, ps.padrao_usuario, ps.padrao_senha, ps.ativo,
      (ps.session_cookie IS NOT NULL) AS tem_session,
      ps.session_expiry,
      (ps.api_token IS NOT NULL)      AS tem_api_token,
      COUNT(c.id_conta)::int          AS total_contas,
      COUNT(c.id_conta) FILTER (WHERE c.status_sinc = 'pendente')::int   AS contas_pendentes,
      COUNT(c.id_conta) FILTER (WHERE c.status_sinc = 'confirmado')::int AS contas_confirmadas
    FROM public.painel_servidores ps
    LEFT JOIN public.contas c ON c.id_painel_servidor = ps.id AND c.removido_em IS NULL
    WHERE ps.id = $1
    GROUP BY ps.id
  `, [id]);
  return rows[0] ?? null;
}

export async function atualizarSessionPainelServidor(
  id: number,
  sessionCookie: string,
  expiryHours?: number
): Promise<void> {
  const expiry = expiryHours
    ? new Date(Date.now() + expiryHours * 3600 * 1000)
    : null;
  await pool.query(
    `UPDATE public.painel_servidores
     SET session_cookie = $2, session_expiry = $3
     WHERE id = $1`,
    [id, sessionCookie, expiry]
  );
}
