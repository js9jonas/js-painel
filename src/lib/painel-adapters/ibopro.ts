// IBO Player Pro (iboproapp.com) — tráfego capturado em 13/10/2026 com o Jonas navegando.
//
// Dois sites, mesma API (api.iboproapp.com):
//  - Painel de revenda (cms.iboproapp.com): login e-mail + senha SEM captcha (o desafio do Cloudflare é só
//    na página, não na API), token Bearer. Lista/busca aparelhos, renomeia e ativa (1 crédito = 1 ano,
//    somado à validade atual).
//  - Site do cliente (iboproapp.com/manage-playlists): login com MAC + chave do aparelho (a mesma de
//    aplicativos.chave). Lista, cria, edita e apaga listas. Cada pedido leva 6 cabeçalhos de "assinatura"
//    calculados no navegador (base64 + embaralhamento + hora atual) — reproduzidos em `cabecalhosCliente`
//    a partir do código do site (_app-*.js, função `b`).
//
// Aparelhos e listas são identificados por id hexadecimal (ObjectId do Mongo); tudo do aparelho é feito
// pelo MAC. Datas da API em UTC ("2027-10-18 12:44:03").

import type { ContaPainel, PainelAdapter, SaveSession, ServidorCredenciais } from "./types";

const API = "https://api.iboproapp.com";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";

export type IboDevice = {
  id: string;
  mac_address: string;
  is_paid: string | boolean;
  activated_at: string | null;
  expire_date: string | null;
  app_type: string | null;
  name: string | null;
  note: string | null;
  [k: string]: unknown;
};

export type IboPlaylist = {
  id: string;
  name: string;
  url: string;
  type: string;
  is_protected: boolean;
  created_at?: string;
  updated_at?: string;
};

/** "2027-10-18 12:44:03" (UTC) → "2027-10-18" no fuso de Brasília. */
export function validadeIbo(expireDate: string | null | undefined): string | null {
  if (!expireDate) return null;
  const d = new Date(expireDate.replace(" ", "T") + "Z");
  return isNaN(d.getTime()) ? null : d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

/** Licença paga (a API manda "1"/"0" na listagem e true/false no info). */
export function iboPago(d: Pick<IboDevice, "is_paid">): boolean {
  return d.is_paid === true || String(d.is_paid) === "1";
}

/** Id numérico estável da lista pro banco (playlist_id_externo é bigint): últimos 12 hex do ObjectId. */
export function idNumericoLista(id: string): number {
  return parseInt(id.slice(-12), 16);
}

/** Validade do token: o do revendedor traz `exp` em milissegundos, o do cliente em segundos. */
export function expiracaoToken(token: string): Date | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    const exp = Number(payload.exp);
    if (!exp) return null;
    return new Date(exp > 1e12 ? exp : exp * 1000);
  } catch {
    return null;
  }
}

export function tokenIboValido(token: string | null | undefined): boolean {
  const exp = token ? expiracaoToken(token) : null;
  return exp != null && exp.getTime() - 2 * 60 * 1000 > Date.now();
}

async function pedir<T>(metodo: string, path: string, token: string | null, corpo?: unknown, extra?: Record<string, string>): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token ?? "null"}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      "User-Agent": UA,
      Origin: path.startsWith("/admin") || path.startsWith("/reseller") ? "https://cms.iboproapp.com" : "https://iboproapp.com",
      ...extra,
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(60_000),
  });
  const texto = await res.text();
  let data: unknown = null;
  try { data = JSON.parse(texto); } catch { /* resposta não-JSON */ }
  const msg = (data as { message?: string } | null)?.message;
  if (!res.ok) throw new Error(`IBO Pro ${path}: ${msg ?? `HTTP ${res.status}`}`);
  if (data && typeof data === "object" && (data as { status?: unknown }).status === false) {
    throw new Error(`IBO Pro ${path}: ${msg ?? "recusado"}`);
  }
  return data as T;
}

// ---------- Painel de revenda ----------

export async function loginIboRevenda(usuario: string, senha: string): Promise<{ token: string; expiry: Date }> {
  const r = await pedir<{ accessToken?: string }>("POST", "/admin/login", null, { username: usuario, password: senha });
  if (!r.accessToken) throw new Error("IBO Pro: login sem token (usuário ou senha errados?).");
  return { token: r.accessToken, expiry: expiracaoToken(r.accessToken) ?? new Date(Date.now() + 60 * 60 * 1000) };
}

export async function creditosIbo(token: string): Promise<number> {
  const r = await pedir<{ credits?: number }>("GET", "/admin/me", token);
  return Number(r.credits ?? 0);
}

type Pagina = { data: IboDevice[]; pager: { total: number; limit: number; page: number } };

async function paginar(token: string, page: number, limit: number, mac = ""): Promise<Pagina> {
  return pedir<Pagina>("POST", "/admin/devices/paginate", token, {
    page, limit, sort: { col: -1, desc: true },
    filter: { mac_address: mac, app_type: "all", paid: false, name: "" },
  });
}

/** Todos os aparelhos da revenda (sync). */
export async function listarAparelhosIbo(token: string): Promise<IboDevice[]> {
  const limite = 100;
  const todos: IboDevice[] = [];
  for (let page = 0; page < 100; page++) {
    const r = await paginar(token, page, limite);
    todos.push(...(r.data ?? []));
    if (!r.data?.length || todos.length >= (r.pager?.total ?? 0)) break;
  }
  return todos;
}

/** Aparelho pelo MAC (só os da revenda). */
export async function buscarAparelhoIbo(token: string, mac: string): Promise<IboDevice | null> {
  const alvo = mac.trim().toLowerCase();
  const r = await paginar(token, 0, 10, alvo);
  return (r.data ?? []).find((d) => d.mac_address?.toLowerCase() === alvo) ?? null;
}

/** Info do aparelho pelo MAC — acha também aparelho que ainda não é da revenda (o modal de ativar usa). */
export async function infoAparelhoIbo(token: string, mac: string): Promise<IboDevice | null> {
  try {
    const r = await pedir<{ device?: IboDevice }>("POST", "/admin/devices/info", token, { mac_address: mac.trim().toLowerCase() });
    return r.device ?? null;
  } catch {
    return null;
  }
}

/** Nome do aparelho na revenda (o site manda o objeto inteiro com o nome trocado). */
export async function renomearAparelhoIbo(token: string, dev: IboDevice, nome: string): Promise<void> {
  await pedir("POST", "/admin/devices/update-additional", token, { ...dev, name: nome });
}

/**
 * Ativa/renova 1 ano (1 crédito). A validade nova soma 1 ano à atual (testado no Fabricio em 13/10/2026:
 * 18/10/2026 → 18/10/2027). Manda o nome junto: com nome vazio, a ativação APAGA o nome do aparelho.
 */
export async function ativarAparelhoIbo(
  token: string,
  mac: string,
  params: { expireDate: string | null; isPaid: boolean; nome: string; nota?: string }
): Promise<{ validade: string | null }> {
  const r = await pedir<{ expire_date?: string }>("POST", "/admin/devices/activate", token, {
    mac_address: mac.trim().toLowerCase(),
    tier: "YEAR",
    isPaid: params.isPaid,
    expireDate: params.expireDate ?? "",
    name: params.nome,
    note: params.nota ?? "",
  });
  return { validade: validadeIbo(r.expire_date ?? null) };
}

// ---------- Site do cliente (listas) ----------

function embaralhar(t: string): string {
  if (t.length >= 6) return t.substring(0, 3) + "iBo" + t.substring(3, t.length - 3) + "PrO" + t.substring(t.length - 3);
  if (t.length >= 3) return t.substring(0, 3) + "iBo" + t.substring(3);
  return t + "PrO";
}
const b64 = (t: string) => Buffer.from(t, "latin1").toString("base64");
const embrulhar = (t: string) => embaralhar(b64(embaralhar(t)));

/** `agora` só pra conferir contra um cabeçalho capturado. */
export function assinarIbo(t: string, agora = Date.now().toString()): string {
  const n = embrulhar(t + agora);
  const digitos: number[] = [];
  for (let i = agora.length - 1; digitos.length < 3 && i >= 0; i--) if (agora[i] > "0") digitos.push(parseInt(agora[i], 10));
  const [o, a, r] = digitos;
  const bytes = Buffer.from(n, "utf8");
  for (let i = 0; i < bytes.length; i++) bytes[i] = (bytes[i] + ((Math.pow(o, a) + Math.pow(a + i, 3) + (o + a) * (r + i)) % 5)) & 0xff;
  return b64(bytes.toString("latin1") + agora);
}

function aleatorio(n: number): string {
  const c = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
  let s = "";
  for (let i = 0; i < n; i++) s += c[Math.floor(Math.random() * (c.length - 1))];
  return s;
}

/** Os 6 cabeçalhos que o site do cliente calcula a cada pedido (mac = aparelho logado). */
export function cabecalhosCliente(mac: string, segredo?: string): Record<string, string> {
  const n = Date.now();
  const e = segredo ?? aleatorio(6);
  return {
    "X-Gc-Token": assinarIbo(`${mac}${n}${2 * n}`),
    "x-hash": assinarIbo(`${mac}___${e}`),
    "x-hash-2": assinarIbo(`${mac}___${e}__${n}`),
    "x-token": assinarIbo(`${mac}${n}`),
    "x-token-2": assinarIbo(mac),
    "x-token-3": embrulhar(mac),
  };
}

export type SessaoAparelhoIbo = { mac: string; token: string };

/** Entra no site do cliente com MAC + chave do aparelho. */
export async function entrarAparelhoIbo(mac: string, chave: string): Promise<SessaoAparelhoIbo> {
  const m = mac.trim().toLowerCase();
  const r = await pedir<{ token?: string }>("POST", "/auth/login", null, { mac: m, password: chave.trim() }, cabecalhosCliente(m, chave.trim()));
  if (!r.token) throw new Error("IBO Pro: o site do cliente não aceitou o MAC + chave.");
  return { mac: m, token: r.token };
}

/** Situação do aparelho vista pelo cliente (ativo + validade). */
export async function situacaoAparelhoIbo(s: SessaoAparelhoIbo): Promise<{ ativo: boolean; validade: string | null }> {
  const r = await pedir<{ isActive?: boolean; expiration?: string }>("POST", "/me", s.token, undefined, cabecalhosCliente(s.mac));
  return { ativo: !!r.isActive, validade: validadeIbo(r.expiration ?? null) };
}

export async function listasIbo(s: SessaoAparelhoIbo): Promise<IboPlaylist[]> {
  const r = await pedir<IboPlaylist[]>("GET", "/playlistw", s.token, undefined, cabecalhosCliente(s.mac));
  return Array.isArray(r) ? r : [];
}

/** Cria (sem id) ou edita (com id) uma lista do tipo URL. Apagar responde "A playlist deleted!". */
export async function salvarListaIbo(s: SessaoAparelhoIbo, lista: { id?: string; nome: string; url: string }): Promise<IboPlaylist> {
  return pedir<IboPlaylist>("POST", "/playlistw", s.token, {
    mac_address: s.mac,
    playlist_name: lista.nome,
    playlist_url: lista.url,
    playlist_id: lista.id ?? null, // o site manda null pra lista nova (confirmado 13/10/2026)
    playlist_type: "URL",
    playlist_host: "",
    playlist_username: "",
    playlist_password: "",
    is_protected: false,
    type: "URL",
    pin: "",
  }, cabecalhosCliente(s.mac));
}

export async function apagarListaIbo(s: SessaoAparelhoIbo, id: string): Promise<void> {
  await pedir("DELETE", "/playlistw", s.token, { mac_address: s.mac, playlist_id: id }, cabecalhosCliente(s.mac));
}

// ---------- Adapter de Conexões (card do painel: conectado, aparelhos, créditos) ----------


export function criarIboProAdapter(creds: ServidorCredenciais, _id: number, onSaveSession: SaveSession): PainelAdapter {
  let token = creds.session_cookie;
  const sessao = async () => {
    if (tokenIboValido(token)) return token!;
    if (!creds.painel_usuario || !creds.painel_senha) throw new Error("Painel IBO Pro sem usuário/senha.");
    const r = await loginIboRevenda(creds.painel_usuario, creds.painel_senha);
    token = r.token;
    await onSaveSession(r.token, r.expiry);
    return r.token;
  };
  return {
    // "Contas" do card = aparelhos da revenda (MAC, nome, validade)
    async listarContas(): Promise<ContaPainel[]> {
      const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      return (await listarAparelhosIbo(await sessao())).map((d) => {
        const venc = iboPago(d) ? validadeIbo(d.expire_date) : null;
        return { usuario: d.mac_address, rotulo: d.name ?? "", vencimento: venc, status: venc && venc >= hoje ? "ok" : "vencida" };
      });
    },
    async getCreditos() {
      return creditosIbo(await sessao());
    },
    async renovar() {
      return { ok: false, erro: "No IBO Pro a renovação é por aparelho (Alertas → Renovar)." };
    },
  };
}

/**
 * Troca o endereço (hostname, com porta se tiver) de TODAS as listas da revenda que usam `antigo`
 * (Mass Change → Hostname, capturado em 13/10/2026: techonline.me → hboard.site, totalUpdated 2).
 */
export async function mudarHostListasIbo(token: string, antigo: string, novo: string): Promise<number> {
  const r = await pedir<{ totalUpdated?: number }>("POST", "/admin/playlists/mass-change-hostname", token, { old: antigo, new: novo });
  return Number(r.totalUpdated ?? 0);
}
