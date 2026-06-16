// Base compartilhada para painéis na plataforma appacesso.com
// FunPlays e LazerPlay usam a mesma API, apenas com URLs e chaves diferentes.
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
}

export interface AppAcessoDevice {
  id: number;
  mac: string;
  model: string;
  activation_expired: string | null;
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

export async function getPlaylistsDispositivo(
  cfg: AppAcessoConfig,
  token: string,
  deviceId: number
): Promise<AppAcessoPlaylist[]> {
  const data = await apiFetch(cfg, token, `/reseller/playlist?deviceId=${deviceId}`);
  return Array.isArray(data) ? (data as AppAcessoPlaylist[]) : [];
}

export async function ativarDispositivo(
  cfg: AppAcessoConfig,
  token: string,
  mac: string,
  packageId = 1
): Promise<string> {
  await apiFetch(cfg, token, "/reseller/activate", {
    method: "POST",
    body: JSON.stringify({ mac, package_id: packageId }),
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
