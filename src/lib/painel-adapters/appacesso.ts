// Base compartilhada para painéis na plataforma appacesso.com
// FunPlays e LazerPlay usam a mesma API, apenas com URLs e chaves diferentes.
import { avisarSaldoZerado, ehErroSaldoZerado } from "@/lib/aviso-saldo-captcha";
import type {
  ContaPainel,
  PainelAdapter,
  ResultadoRenovacao,
  ServidorCredenciais,
  SaveSession,
  SaveContaVencimento,
} from "./types";

export interface AppAcessoConfig {
  apiBase: string;
  websiteUrl: string;
  recaptchaKey: string; // vazio = sem captcha (ex: CorePlayer)
  nomeApp: string;
  requireOrigin?: boolean; // true = envia Origin/Referer (ex: CorePlayer bloqueia sem isso)
  /** API do site do CLIENTE (o dono do aparelho entra com MAC + chave). Ver "Site do cliente" abaixo. */
  apiCliente?: string;
}

export interface AppAcessoDevice {
  /** Número interno do aparelho no painel (usado nas chamadas da API) — NÃO é a chave da TV. */
  id: number;
  mac: string;
  model: string;
  activation_expired: string | null;
  /** Chave real do aparelho ("Device Key" na TV; pedida pelo "add existing device"). */
  key?: string | number | null;
  device_note?: { comment: string | null };
}

export interface AppAcessoPlaylist {
  id: number;
  name: string;
  url: string;
  is_selected: boolean;
  expired_date: string | null;
}

// ---------- reCAPTCHA via CapSolver ----------

async function resolverRecaptcha(cfg: AppAcessoConfig): Promise<string> {
  const apiKey = process.env.CAPSOLVER_API_KEY;
  if (!apiKey) throw new Error("CAPSOLVER_API_KEY não definida.");

  const criacao = await fetch("https://api.capsolver.com/createTask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientKey: apiKey,
      task: {
        type: "ReCaptchaV2EnterpriseTaskProxyless",
        websiteURL: cfg.websiteUrl,
        websiteKey: cfg.recaptchaKey,
      },
    }),
  }).then((r) => r.json()) as any;

  if (criacao.errorId) {
    if (ehErroSaldoZerado(criacao)) void avisarSaldoZerado("capsolver");
    throw new Error(`CapSolver createTask: ${criacao.errorDescription ?? criacao.errorCode}`);
  }

  const { taskId } = criacao;

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const result = await fetch("https://api.capsolver.com/getTaskResult", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientKey: apiKey, taskId }),
    }).then((r) => r.json()) as any;

    if (result.status === "ready") return result.solution.gRecaptchaResponse as string;
    if (result.errorId) {
      throw new Error(`CapSolver getTaskResult: ${result.errorDescription ?? result.errorCode}`);
    }
  }

  throw new Error(`${cfg.nomeApp}: reCAPTCHA não resolvido após 120s.`);
}

// ---------- Auth ----------

function parseJwtExpiry(token: string): Date | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return payload.exp ? new Date(Number(payload.exp) * 1000) : null;
  } catch {
    return null;
  }
}

export function jwtValido(token: string): boolean {
  const exp = parseJwtExpiry(token);
  return exp != null && exp.getTime() - 2 * 60 * 1000 > Date.now();
}

export async function loginAppAcesso(
  cfg: AppAcessoConfig,
  email: string,
  senha: string
): Promise<{ token: string; expiry: Date }> {
  const body: Record<string, string> = { email, password: senha };
  if (cfg.recaptchaKey) {
    body.token = await resolverRecaptcha(cfg);
  }

  const loginHeaders: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.requireOrigin) {
    loginHeaders.origin = cfg.websiteUrl;
    loginHeaders.referer = cfg.websiteUrl + "/";
  }
  const res = await fetch(`${cfg.apiBase}/reseller/login`, {
    method: "POST",
    headers: loginHeaders,
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as any;
  if (data.error || !data.message) {
    throw new Error(`${cfg.nomeApp} login falhou: ${data.message ?? JSON.stringify(data)}`);
  }

  const token = data.message as string;
  const expiry = parseJwtExpiry(token) ?? new Date(Date.now() + 60 * 60 * 1000);
  return { token, expiry };
}

async function obterToken(
  cfg: AppAcessoConfig,
  creds: ServidorCredenciais,
  onSaveSession: SaveSession
): Promise<string> {
  if (creds.session_cookie && jwtValido(creds.session_cookie)) {
    return creds.session_cookie;
  }
  const { token, expiry } = await loginAppAcesso(cfg, creds.painel_usuario, creds.painel_senha);
  await onSaveSession(token, expiry);
  creds.session_cookie = token;
  return token;
}

// ---------- HTTP helper ----------

async function apiFetch(
  cfg: AppAcessoConfig,
  token: string,
  path: string,
  options: RequestInit = {}
): Promise<any> {
  const extraHeaders: Record<string, string> = cfg.requireOrigin
    ? { origin: cfg.websiteUrl, referer: cfg.websiteUrl + "/" }
    : {};
  const res = await fetch(`${cfg.apiBase}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      authorization: token,
      ...extraHeaders,
      ...(options.headers as Record<string, string> | undefined),
    },
  });
  if (res.status === 401) throw new Error(`${cfg.nomeApp}: token inválido (401).`);
  const data = (await res.json()) as any;
  if (data.error) throw new Error(`${cfg.nomeApp} API: ${data.message ?? JSON.stringify(data)}`);
  return data.message;
}

// ---------- Funções exportadas para sync ----------

export async function getDispositivos(
  cfg: AppAcessoConfig,
  token: string
): Promise<AppAcessoDevice[]> {
  const all: AppAcessoDevice[] = [];
  let page = 1;
  while (true) {
    const data = await apiFetch(cfg, token, `/reseller/devices?limit=100&page=${page}&sort=["id","DESC"]`);
    all.push(...(data.rows as AppAcessoDevice[]));
    if (page >= data.pageCount) break;
    page++;
  }
  return all;
}

/**
 * Comentário do aparelho no painel (nome do cliente, pra busca). Formato capturado no painel
 * FunPlay em 08/10/2026: PUT /reseller/device/comment { comment, id } — `id` = número interno
 * do aparelho (o mesmo de /reseller/devices), não o id da nota.
 */
export async function editarComentario(cfg: AppAcessoConfig, token: string, deviceId: number, comentario: string): Promise<void> {
  await apiFetch(cfg, token, `/reseller/device/comment`, {
    method: "PUT",
    body: JSON.stringify({ comment: comentario, id: deviceId }),
  });
}

/**
 * "Add existing device": traz pra ESTE painel um aparelho de outro painel (MAC + chave real).
 * Capturado no FunPlay em 08/10/2026: POST /reseller/add_existing_device { mac, key } → "Success".
 * Segundo o Jonas: o aparelho sai do painel antigo, a validade vem junto, não gasta crédito e o
 * comentário chega vazio ("N/A").
 */
export async function adicionarExistente(cfg: AppAcessoConfig, token: string, mac: string, chave: string): Promise<void> {
  await apiFetch(cfg, token, `/reseller/add_existing_device`, {
    method: "POST",
    body: JSON.stringify({ mac, key: chave }),
  });
}

export interface AppAcessoValidacaoMac {
  /** Número interno do aparelho (o mesmo de /reseller/devices). */
  id: number;
  mac: string;
  payed: boolean;
  /** "device_key" = add existing com a chave da TV; "otp" = pede código mostrado na TV. */
  auth_type: string;
  model?: string | null;
}

/**
 * Confere o MAC no sistema do app (qualquer revendedor). Formato conferido no FunPlay em 11/10/2026:
 * GET /reseller/validate_mac?mac= → { payed, free_trial, mac, auth_type, id, model, notes }.
 * Erro da API = MAC não existe (o app nunca foi aberto nesse aparelho).
 */
export async function validarMac(cfg: AppAcessoConfig, token: string, mac: string): Promise<AppAcessoValidacaoMac> {
  return apiFetch(cfg, token, `/reseller/validate_mac?mac=${encodeURIComponent(mac)}`);
}

/**
 * Aparelho DESTE revendedor pelo MAC (null se não está no painel). Mesma busca do site
 * (main.b0256ef8.js): GET /reseller/devices?search={"mac":...}.
 */
export async function buscarDispositivoPorMac(cfg: AppAcessoConfig, token: string, mac: string): Promise<AppAcessoDevice | null> {
  const q = new URLSearchParams({ limit: "10", pagination: "1", page: "1", search: JSON.stringify({ mac }) });
  const data = await apiFetch(cfg, token, `/reseller/devices?${q}`);
  const rows = (data?.rows ?? []) as AppAcessoDevice[];
  return rows.find((d) => d.mac.toUpperCase() === mac.toUpperCase()) ?? null;
}

// ---------- Site do cliente: listas do aparelho, inclusive as ocultas ----------
// Achado do Jonas em 12/10/2026 (capturado no lazerplay.io, conferido no Fun Play): o site do cliente
// entra com MAC + chave do aparelho (sem captcha) e mostra TODAS as listas do aparelho — também as que o
// painel de revenda esconde — e deixa apagá-las. A resposta traz usuário/senha das listas: não logar.

export interface AppAcessoListaAparelho {
  id: number;
  name: string;
  url: string;
  is_selected: boolean;
  reseller_id: number | null;
  createdAt?: string;
}

async function clienteFetch(cfg: AppAcessoConfig, path: string, tokenAparelho: string | null, options: RequestInit = {}): Promise<any> {
  if (!cfg.apiCliente) throw new Error(`${cfg.nomeApp}: site do cliente não configurado.`);
  const res = await fetch(`${cfg.apiCliente}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", authorization: `Bearer ${tokenAparelho ?? "null"}` },
  });
  const data = (await res.json().catch(() => null)) as any;
  if (!data || data.error) throw new Error(`${cfg.nomeApp} (site do cliente): ${data?.message ?? `HTTP ${res.status}`}`);
  return data.message;
}

/** Entra no site do cliente como o aparelho. A chave é a "Device Key" da TV (`aplicativos.chave`). */
export async function entrarComoAparelho(cfg: AppAcessoConfig, mac: string, chave: string): Promise<string> {
  // o MAC precisa ir como o app registrou (maiúsculas/minúsculas): o validate_mac devolve a forma certa
  const v = await clienteFetch(cfg, `/api/validate_mac?mac=${encodeURIComponent(mac)}`, null).catch(() => null);
  const token = await clienteFetch(cfg, "/api/login_by_mac", null, {
    method: "POST",
    body: JSON.stringify({ mac: v?.mac ?? mac, key: String(chave).trim() }),
  });
  if (typeof token !== "string" || !token) throw new Error(`${cfg.nomeApp}: o site do cliente não aceitou MAC + chave.`);
  return token;
}

export async function listasNoAparelho(cfg: AppAcessoConfig, tokenAparelho: string): Promise<AppAcessoListaAparelho[]> {
  const d = await clienteFetch(cfg, "/api/device", tokenAparelho);
  return Array.isArray(d?.playlists) ? (d.playlists as AppAcessoListaAparelho[]) : [];
}

/** DELETE /api/palylist_from_web { id } — assim mesmo, "palylist". */
export async function apagarListaNoAparelho(cfg: AppAcessoConfig, tokenAparelho: string, id: number): Promise<void> {
  await clienteFetch(cfg, "/api/palylist_from_web", tokenAparelho, { method: "DELETE", body: JSON.stringify({ id }) });
}

// ---------- Servidores (host das listas) e migração em massa ----------
// Formato lido no código do site (main.b0256ef8.js, igual nos 3 apps) e conferido ao vivo no FunPlay
// em 11/10/2026 (GET). Cada "servidor" tem um host; as listas com esse host contam nele (device_count).

export interface AppAcessoServidor {
  id: number;
  name: string;
  host: string;
  code: string | null;
  device_count: number | null;
  createdAt?: string;
  updatedAt?: string;
}

/** GET /reseller/server (o plural /reseller/servers dá 404). */
export async function listarServidores(cfg: AppAcessoConfig, token: string): Promise<AppAcessoServidor[]> {
  const data = await apiFetch(cfg, token, `/reseller/server?limit=100&page=1`);
  return (data?.rows ?? []) as AppAcessoServidor[];
}

/** POST /reseller/server { host, name, code? }. Devolve a mensagem do painel (pode ser "enviado para aprovação"). */
export async function criarServidor(
  cfg: AppAcessoConfig,
  token: string,
  params: { host: string; name: string; code?: string }
): Promise<unknown> {
  return apiFetch(cfg, token, "/reseller/server", {
    method: "POST",
    body: JSON.stringify({ host: params.host, name: params.name, ...(params.code ? { code: params.code } : {}) }),
  });
}

/**
 * Migração em massa ("Server Migrate"): PUT /reseller/server/migrate { id, host, replace }.
 * `replace` = checkbox "Migrate Playlists": true troca o host das listas desse servidor junto;
 * false troca só o host cadastrado no servidor e deixa as listas como estão.
 */
export async function migrarServidor(
  cfg: AppAcessoConfig,
  token: string,
  params: { id: number; host: string; replace: boolean }
): Promise<unknown> {
  return apiFetch(cfg, token, "/reseller/server/migrate", {
    method: "PUT",
    body: JSON.stringify({ id: params.id, host: params.host, replace: params.replace }),
  });
}

/**
 * Reconta os aparelhos do servidor pelo host atual: PUT /reseller/server/sync_device_count { id }.
 * Conferido 11/10/2026: depois de migrar sem levar as listas, o FAST seguia com 277 (contagem antiga);
 * recontado, mostrou 245 = exatamente as listas com o host novo.
 */
export async function recontarServidor(cfg: AppAcessoConfig, token: string, id: number): Promise<void> {
  await apiFetch(cfg, token, "/reseller/server/sync_device_count", { method: "PUT", body: JSON.stringify({ id }) });
}

export async function getPlaylistsDispositivo(
  cfg: AppAcessoConfig,
  token: string,
  deviceId: number
): Promise<AppAcessoPlaylist[]> {
  const data = await apiFetch(cfg, token, `/reseller/playlist?deviceId=${deviceId}`);
  return Array.isArray(data) ? (data as AppAcessoPlaylist[]) : [];
}

export async function criarPlaylist(
  cfg: AppAcessoConfig,
  token: string,
  params: { deviceId: number; name: string; url: string; is_protected?: boolean }
): Promise<void> {
  await apiFetch(cfg, token, "/reseller/playlist", {
    method: "POST",
    body: JSON.stringify({
      deviceId: params.deviceId,
      name: params.name,
      url: params.url,
      is_protected: params.is_protected ?? false,
    }),
  });
}

export async function editarPlaylist(
  cfg: AppAcessoConfig,
  token: string,
  params: { id: number; deviceId: number; name: string; url: string; is_protected?: boolean }
): Promise<void> {
  await apiFetch(cfg, token, "/reseller/playlist", {
    method: "PUT",
    body: JSON.stringify({
      id: params.id,
      deviceId: params.deviceId,
      name: params.name,
      url: params.url,
      is_protected: params.is_protected ?? false,
    }),
  });
}

export async function excluirPlaylist(
  cfg: AppAcessoConfig,
  token: string,
  params: { id: number; deviceId: number }
): Promise<void> {
  await apiFetch(cfg, token, "/reseller/playlist", {
    method: "DELETE",
    body: JSON.stringify({ id: params.id, deviceId: params.deviceId }),
  });
}

/**
 * Marca a playlist como a ativa (a que o app abre) no aparelho. Mesmo código nos sites
 * FunPlay/LazerPlay/CorePlayer (main.b0256ef8.js, conferido 09/10/2026): botão "Set Selected"
 * → PUT /reseller/playlist/set_selected { id } — `id` da playlist, sem deviceId.
 */
export async function selecionarPlaylist(cfg: AppAcessoConfig, token: string, id: number): Promise<void> {
  await apiFetch(cfg, token, "/reseller/playlist/set_selected", {
    method: "PUT",
    body: JSON.stringify({ id }),
  });
}

/**
 * Ativa (gasta crédito). POST /reseller/activate { mac, package_id, comment? } — o `comment` opcional
 * grava o nome do cliente no aparelho na mesma chamada (conferido no site em 11/10/2026).
 */
export async function ativarDispositivo(
  cfg: AppAcessoConfig,
  token: string,
  mac: string,
  packageId = 1,
  comentario?: string
): Promise<string> {
  await apiFetch(cfg, token, "/reseller/activate", {
    method: "POST",
    body: JSON.stringify({ mac, package_id: packageId, ...(comentario ? { comment: comentario } : {}) }),
  });
  const devices = await apiFetch(cfg, token, `/reseller/devices?limit=10&page=1&sort=["id","DESC"]`);
  const dev = (devices.rows as AppAcessoDevice[]).find((d) => d.mac === mac);
  if (dev?.activation_expired) {
    return new Date(dev.activation_expired).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  }
  return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    .toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

function calcularStatus(activationExpired: string | null): ContaPainel["status"] {
  if (!activationExpired) return "bloqueada";
  return new Date(activationExpired) > new Date() ? "ok" : "vencida";
}

// ---------- PainelAdapter factory ----------

export function criarAppAcessoAdapter(
  cfg: AppAcessoConfig,
  creds: ServidorCredenciais,
  _id: number,
  onSaveSession: SaveSession,
  _onSaveContas: SaveContaVencimento
): PainelAdapter {
  async function token(): Promise<string> {
    return obterToken(cfg, creds, onSaveSession);
  }

  return {
    async listarContas(): Promise<ContaPainel[]> {
      const jwt = await token();
      const devices = await getDispositivos(cfg, jwt);
      return devices.map((d) => ({
        usuario: d.mac,
        rotulo: d.device_note?.comment ?? d.model ?? "",
        vencimento: d.activation_expired
          ? new Date(d.activation_expired).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
          : null,
        status: calcularStatus(d.activation_expired),
      }));
    },

    async renovar(mac: string): Promise<ResultadoRenovacao> {
      try {
        const jwt = await token();
        const novoVencimento = await ativarDispositivo(cfg, jwt, mac);
        return { ok: true, novoVencimento };
      } catch (e: any) {
        return { ok: false, erro: e.message };
      }
    },

    async getCreditos(): Promise<number | null> {
      try {
        const jwt = await token();
        const data = await apiFetch(cfg, jwt, "/reseller");
        return data?.reseller?.total_activations ?? null;
      } catch {
        return null;
      }
    },
  };
}
