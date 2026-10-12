// Operações nos painéis de app da plataforma appacesso (Fun Play, Lazer Play, Core Player): mesmo
// código de site e mesma API, muda só o endereço. Usado pelo cadastro de aparelho novo (add existing +
// lista, sem gastar crédito) e pela ativação no painel a partir de /alertas (gasta 1 crédito).
import { pool } from "@/lib/db";
import {
  jwtValido,
  loginAppAcesso,
  criarPlaylist,
  getPlaylistsDispositivo,
  entrarComoAparelho,
  listasNoAparelho,
  apagarListaNoAparelho,
  selecionarPlaylist,
  type AppAcessoConfig,
  type AppAcessoPlaylist,
} from "@/lib/painel-adapters/appacesso";
import { CONFIG as CONFIG_FUNPLAYS } from "@/lib/painel-adapters/funplays";
import { CONFIG as CONFIG_LAZERPLAY } from "@/lib/painel-adapters/lazerplay";
import { CONFIG as CONFIG_COREPLAYER } from "@/lib/painel-adapters/coreplayer";
import { TIPO_POR_ID_APP, type TipoPainelApp } from "@/lib/apps-painel-ids";

export { TIPO_POR_ID_APP, type TipoPainelApp };

export const TIPOS_PAINEL_APP: TipoPainelApp[] = ["funplays", "lazerplay", "coreplayer"];

export function configDoTipo(tipo: TipoPainelApp): AppAcessoConfig {
  return tipo === "lazerplay" ? CONFIG_LAZERPLAY : tipo === "coreplayer" ? CONFIG_COREPLAYER : CONFIG_FUNPLAYS;
}

export type PainelApp = { id: number; nome: string; tipo: TipoPainelApp; cfg: AppAcessoConfig };

/** Painel ATIVO mais novo do app (ex.: Fun Play → "FunPlay (novo)", id 106). */
export async function painelAtivoDoApp(idApp: number): Promise<PainelApp | null> {
  const tipo = TIPO_POR_ID_APP[idApp];
  if (!tipo) return null;
  const { rows } = await pool.query<{ id: number; nome: string }>(
    `SELECT id, nome FROM public.painel_servidores WHERE tipo = $1 AND ativo = true ORDER BY id DESC LIMIT 1`,
    [tipo]
  );
  return rows[0] ? { id: Number(rows[0].id), nome: rows[0].nome, tipo, cfg: configDoTipo(tipo) } : null;
}

/** Painel pelo id (ex.: o painel onde o aparelho já está). */
export async function painelAppPorId(idPainel: number): Promise<PainelApp | null> {
  const { rows } = await pool.query<{ id: number; nome: string; tipo: string }>(
    `SELECT id, nome, tipo FROM public.painel_servidores WHERE id = $1`,
    [idPainel]
  );
  const r = rows[0];
  if (!r || !TIPOS_PAINEL_APP.includes(r.tipo as TipoPainelApp)) return null;
  const tipo = r.tipo as TipoPainelApp;
  return { id: Number(r.id), nome: r.nome, tipo, cfg: configDoTipo(tipo) };
}

/** Sessão (JWT) do painel: reaproveita a salva se ainda vale; senão faz login (captcha via CapSolver) e salva. */
export async function sessaoPainelApp(painel: PainelApp): Promise<string> {
  const { rows } = await pool.query<{ usuario: string; senha: string; session_cookie: string | null }>(
    `SELECT usuario, senha, session_cookie FROM public.painel_servidores WHERE id = $1`,
    [painel.id]
  );
  const r = rows[0];
  if (!r) throw new Error("Painel não encontrado.");
  if (r.session_cookie && jwtValido(r.session_cookie)) return r.session_cookie;

  const { token, expiry } = await loginAppAcesso(painel.cfg, r.usuario, r.senha);
  await pool.query(
    `UPDATE public.painel_servidores SET session_cookie = $1, session_expiry = $2 WHERE id = $3`,
    [token, expiry, painel.id]
  );
  return token;
}

/** Nome da lista no app: primeiro nome do cliente + " TV" (padrão usado nas listas de 11/10/2026). */
export function nomeListaCliente(nomeCliente: string): string {
  const primeiro = nomeCliente.trim().split(/\s+/)[0] || "Minha";
  return `${primeiro} TV`;
}

export type AparelhoCliente = { mac: string | null; chave: string | null };

/**
 * Cria a lista. Se o painel recusar porque ela "já existe" — uma lista OCULTA igual no aparelho, que o
 * painel de revenda não mostra —, entra no site do cliente com MAC + chave, apaga as ocultas com a mesma
 * URL e tenta de novo (achado de 12/10/2026). Sem chave, o erro original sobe.
 */
export async function criarPlaylistLimpandoOculta(
  cfg: AppAcessoConfig,
  token: string,
  params: { deviceId: number; name: string; url: string },
  aparelho?: AparelhoCliente
): Promise<{ ocultasApagadas: number }> {
  try {
    await criarPlaylist(cfg, token, params);
    return { ocultasApagadas: 0 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/already exist/i.test(msg) || !aparelho?.mac || !aparelho.chave || !cfg.apiCliente) throw e;
    const visiveis = new Set((await getPlaylistsDispositivo(cfg, token, params.deviceId)).map((p) => Number(p.id)));
    const tokenAparelho = await entrarComoAparelho(cfg, aparelho.mac, aparelho.chave);
    const ocultas = (await listasNoAparelho(cfg, tokenAparelho)).filter(
      (p) => p.url === params.url && !visiveis.has(Number(p.id))
    );
    if (!ocultas.length) throw e;
    for (const p of ocultas) await apagarListaNoAparelho(cfg, tokenAparelho, Number(p.id));
    await criarPlaylist(cfg, token, params);
    return { ocultasApagadas: ocultas.length };
  }
}

/**
 * Cria a lista no aparelho e, se ela for a única visível, marca como ativa (a playlist nasce
 * `is_selected:false`). Devolve a lista como o painel a mostra depois.
 */
export async function criarListaAtiva(
  cfg: AppAcessoConfig,
  token: string,
  deviceId: number,
  nome: string,
  url: string,
  aparelho?: AparelhoCliente
): Promise<{ lista: AppAcessoPlaylist | null; ativa: boolean; ocultasApagadas: number }> {
  const { ocultasApagadas } = await criarPlaylistLimpandoOculta(cfg, token, { deviceId, name: nome, url }, aparelho);
  let listas = await getPlaylistsDispositivo(cfg, token, deviceId);
  let lista = listas.find((p) => p.url === url) ?? null;
  if (lista && listas.length === 1 && !lista.is_selected) {
    const id = lista.id;
    try {
      await selecionarPlaylist(cfg, token, id);
      listas = await getPlaylistsDispositivo(cfg, token, deviceId);
      lista = listas.find((p) => p.id === id) ?? lista;
    } catch {
      // segue: a lista já existe; quem chamou avisa que não ficou ativa
    }
  }
  return { lista, ativa: !!lista?.is_selected, ocultasApagadas };
}

/** "YYYY-MM-DD" no fuso de Brasília a partir do activation_expired do painel (null = sem validade). */
export function validadeDoPainel(activationExpired: string | null | undefined): string | null {
  return activationExpired
    ? new Date(activationExpired).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
    : null;
}
