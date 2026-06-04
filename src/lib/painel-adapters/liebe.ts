import { Impit } from "impit";
import { impitFetch } from "./proxy-retry";
import type { ContaPainel, PainelAdapter, ResultadoRenovacao, ServidorCredenciais, SaveSession, SaveContaVencimento } from "./types";

// LIEBE (liebeapp.sigma.vin) — Laravel Sanctum Bearer token
// Auto-login: POST /api/auth/login → token longa duração
// Re-login automático em 401
// proxyUrl obrigatório — liebeapp.sigma.vin bloqueia IP do datacenter

const API_BASE   = "https://liebeapp.sigma.vin/api";
const ORIGIN     = "https://painel.liebeapp.me";

const impit = new Impit({ browser: "chrome", proxyUrl: process.env.UNIPLAY_PROXY_URL });

function baseHeaders(token?: string): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "Origin":       ORIGIN,
    "Referer":      `${ORIGIN}/`,
  };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function loginLiebe(usuario: string, senha: string): Promise<string> {
  const res = await impitFetch(impit, `${API_BASE}/auth/login`, {
    method: "POST",
    headers: baseHeaders(),
    body: JSON.stringify({ username: usuario, password: senha }),
  });
  if (!res.ok) throw new Error(`LIEBE login HTTP ${res.status}`);
  const j = await res.json() as any;
  if (!j.token) throw new Error("LIEBE login: token ausente na resposta.");
  return j.token as string;
}

class LiebeUnauthorizedError extends Error {}

async function liebeGet(token: string, path: string): Promise<any> {
  const res = await impitFetch(impit, `${API_BASE}${path}`, { headers: baseHeaders(token) });
  if (res.status === 401) throw new LiebeUnauthorizedError();
  if (!res.ok) throw new Error(`LIEBE GET ${path} → ${res.status}`);
  return res.json();
}

async function liebePost(token: string, path: string, body?: object): Promise<any> {
  const res = await impitFetch(impit, `${API_BASE}${path}`, {
    method: "POST",
    headers: baseHeaders(token),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new LiebeUnauthorizedError();
  if (!res.ok) throw new Error(`LIEBE POST ${path} → ${res.status}`);
  return res.json();
}

export function criarLiebeAdapter(
  creds: ServidorCredenciais,
  _id: number,
  onSaveSession: SaveSession,
  onSaveContas: SaveContaVencimento,
): PainelAdapter {
  let tokenCache = creds.session_cookie ?? "";
  const usuario  = creds.painel_usuario ?? "";
  const senha    = creds.painel_senha   ?? "";

  async function getToken(): Promise<string> {
    if (tokenCache) return tokenCache;
    tokenCache = await loginLiebe(usuario, senha);
    await onSaveSession(tokenCache);
    return tokenCache;
  }

  async function withRelogin<T>(fn: (token: string) => Promise<T>): Promise<T> {
    const token = await getToken();
    try {
      return await fn(token);
    } catch (err) {
      if (!(err instanceof LiebeUnauthorizedError)) throw err;
      tokenCache = await loginLiebe(usuario, senha);
      await onSaveSession(tokenCache);
      return await fn(tokenCache);
    }
  }

  return {
    async listarContas(): Promise<ContaPainel[]> {
      return withRelogin(async (token) => {
        const json = await liebeGet(token, "/customers?page=1&perPage=500");
        const list: any[] = json.data ?? [];
        return list.map((c) => ({
          usuario:    c.username,
          rotulo:     c.note || c.name || "",
          vencimento: c.expires_at_tz ? c.expires_at_tz.slice(0, 10) : null,
          status:     c.status === "ACTIVE" ? "ok" : c.status === "EXPIRED" ? "vencida" : "bloqueada",
        }));
      });
    },

    async getCreditos(): Promise<number | null> {
      return withRelogin(async (token) => {
        const j = await liebeGet(token, "/auth/me");
        return typeof j.credits === "number" ? j.credits : null;
      });
    },

    async renovar(usuario: string, meses = 1): Promise<ResultadoRenovacao> {
      return withRelogin(async (token) => {
        // Busca id interno pelo username
        const json = await liebeGet(token, "/customers?page=1&perPage=500");
        const conta = (json.data ?? []).find((c: any) => c.username === usuario);
        if (!conta) throw new Error(`LIEBE: usuário "${usuario}" não encontrado.`);

        await liebePost(token, `/customers/${conta.id}/renew`);

        // Busca novo vencimento
        const updated = await liebeGet(token, `/customers/${conta.id}`);
        const novoVenc = updated.data?.expires_at_tz?.slice(0, 10) ?? undefined;
        if (novoVenc) await onSaveContas(usuario, novoVenc);
        return { ok: true, novoVencimento: novoVenc };
      });
    },
  };
}
