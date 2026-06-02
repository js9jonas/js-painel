import { Impit, type HttpMethod } from "impit";
import type { ContaPainel, PainelAdapter, ResultadoRenovacao, ServidorCredenciais, SaveSession, SaveContaVencimento } from "./types";

// API base: https://gesapioffice.com/api
// Auth: JWT Bearer — auto-login com TLS Chrome (via impit)
// Sessão: ~6h — renovada automaticamente via login

const API_BASE = "https://gesapioffice.com/api";

// Instância global reutilizada entre requisições — imita TLS Chrome
const impit = new Impit({ browser: "chrome" });

const ORIGIN_HEADERS = {
  Origin: "http://searchdefense.top",
  Referer: "http://searchdefense.top/",
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

interface UniplaySession {
  token: string;
  cryptPass: string;
}

function parseSession(cookie: string | null): UniplaySession | null {
  if (!cookie) return null;
  try {
    return JSON.parse(cookie);
  } catch {
    return null;
  }
}

async function login(usuario: string, senha: string): Promise<UniplaySession> {
  const res = await impit.fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ORIGIN_HEADERS },
    body: JSON.stringify({ username: usuario, password: senha, code: "" }),
  });
  if (!res.ok) throw new Error(`UNIPLAY login falhou: ${res.status}`);
  const data = await res.json() as any;
  if (!data.access_token) throw new Error("UNIPLAY: sem access_token na resposta de login");
  return { token: data.access_token, cryptPass: data.crypt_pass };
}

async function getSession(creds: ServidorCredenciais, onSaveSession: SaveSession): Promise<UniplaySession> {
  if (creds.session_cookie) {
    const expirado = creds.session_expiry && new Date(creds.session_expiry) <= new Date();
    if (!expirado) {
      const session = parseSession(creds.session_cookie);
      if (session) return session;
    }
  }
  return freshLogin(onSaveSession, creds.painel_usuario, creds.painel_senha);
}

async function freshLogin(onSaveSession: SaveSession, usuario: string, senha: string): Promise<UniplaySession> {
  const session = await login(usuario, senha);
  const expiresAt = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  await onSaveSession(JSON.stringify(session), expiresAt);
  return session;
}

async function authFetch(token: string, path: string, init: { method?: HttpMethod; body?: string } = {}) {
  return impit.fetch(`${API_BASE}/${path}`, {
    method: init.method ?? "GET",
    body: init.body,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...ORIGIN_HEADERS,
    },
  });
}

function mapStatus(status: string, expTimestamp: number): ContaPainel["status"] {
  if (status === "Desativado") return "bloqueada";
  if (expTimestamp && new Date(expTimestamp * 1000) < new Date()) return "vencida";
  return "ok";
}

async function listarUsuarios(
  session: UniplaySession,
  onSaveSession: SaveSession,
  creds: ServidorCredenciais,
  jaRelogou = false
): Promise<any[]> {
  const res = await authFetch(session.token, `users-iptv?reg_password=${encodeURIComponent(session.cryptPass)}`);

  // Sessão stale — força re-login uma vez
  if ((res.status === 404 || res.status === 401) && !jaRelogou) {
    const nova = await freshLogin(onSaveSession, creds.painel_usuario, creds.painel_senha);
    return listarUsuarios(nova, onSaveSession, creds, true);
  }

  if (!res.ok) throw new Error(`UNIPLAY users-iptv → ${res.status}`);
  const data = await res.json() as any;
  return Array.isArray(data) ? data : Object.values(data);
}

export function criarUniplayAdapter(creds: ServidorCredenciais, _id: number, onSaveSession: SaveSession, onSaveContas: SaveContaVencimento): PainelAdapter {
  let _sessionPromise: Promise<UniplaySession> | null = null;
  function obterSessao(): Promise<UniplaySession> {
    if (!_sessionPromise) _sessionPromise = getSession(creds, onSaveSession);
    return _sessionPromise;
  }
  function listar(session: UniplaySession) {
    return listarUsuarios(session, onSaveSession, creds);
  }
  return {
    async listarContas(): Promise<ContaPainel[]> {
      const session = await obterSessao();
      const users = await listar(session);
      return users.map((u: any) => ({
        usuario: u.username,
        rotulo: u.nota || "",
        vencimento: u.exp_date_timestamp
          ? new Date(u.exp_date_timestamp * 1000).toISOString().slice(0, 10)
          : null,
        status: mapStatus(u.status, u.exp_date_timestamp ?? 0),
      }));
    },

    async renovar(usuario: string, meses = 1): Promise<ResultadoRenovacao> {
      const session = await obterSessao();
      const users = await listar(session);
      const user = users.find((u: any) => u.username === usuario);
      if (!user) throw new Error(`UNIPLAY: usuário "${usuario}" não encontrado`);

      const res = await authFetch(session.token, `users-iptv/${user.id}`, {
        method: "POST",
        body: JSON.stringify({ action: 1, credits: meses, reg_password: session.cryptPass }),
      });
      if (!res.ok) throw new Error(`UNIPLAY renovar → ${res.status}`);

      const updated = (await listar(session)).find((u: any) => u.username === usuario);
      const novoVenc = updated?.exp_date_timestamp
        ? new Date(updated.exp_date_timestamp * 1000).toISOString().slice(0, 10)
        : undefined;

      if (novoVenc) await onSaveContas(usuario, novoVenc);
      return { ok: true, novoVencimento: novoVenc };
    },

    async getCreditos(): Promise<number | null> {
      try {
        const session = await obterSessao();
        const res = await authFetch(session.token, "dash-reseller");
        if (!res.ok) return null;
        const data = await res.json() as any;
        return data.credits != null ? parseFloat(data.credits) : null;
      } catch {
        return null;
      }
    },
  };
}
