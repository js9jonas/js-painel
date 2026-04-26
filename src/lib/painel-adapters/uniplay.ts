import { pool } from "@/lib/db";
import type { ContaPainel, PainelAdapter, ResultadoRenovacao, ServidorCredenciais } from "./types";

// API base: https://gesapioffice.com/api
// Auth: JWT Bearer — auto-login (sem CAPTCHA, code:"" funciona)
// Sessão: ~6h — renovada automaticamente via login

const API_BASE = "https://gesapioffice.com/api";

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
  const res = await fetch(`${API_BASE}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ORIGIN_HEADERS },
    body: JSON.stringify({ username: usuario, password: senha, code: "" }),
  });
  if (!res.ok) throw new Error(`UNIPLAY login falhou: ${res.status}`);
  const data = await res.json();
  if (!data.access_token) throw new Error("UNIPLAY: sem access_token na resposta de login");
  return { token: data.access_token, cryptPass: data.crypt_pass };
}

async function getSession(creds: ServidorCredenciais, idServidor: number): Promise<UniplaySession> {
  if (creds.session_cookie && creds.session_expiry && new Date(creds.session_expiry) > new Date()) {
    const session = parseSession(creds.session_cookie);
    if (session) return session;
  }
  const session = await login(creds.painel_usuario, creds.painel_senha);
  const expiresAt = new Date(Date.now() + 5.5 * 60 * 60 * 1000); // 5.5h (token dura 6h)
  await pool.query(
    `UPDATE public.servidores SET session_cookie = $1, session_expiry = $2 WHERE id_servidor = $3`,
    [JSON.stringify(session), expiresAt, idServidor]
  );
  return session;
}

function authFetch(token: string, path: string, options: RequestInit = {}) {
  return fetch(`${API_BASE}/${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...ORIGIN_HEADERS,
      ...(options.headers ?? {}),
    },
  });
}

function mapStatus(status: string, expTimestamp: number): ContaPainel["status"] {
  if (status === "Desativado") return "bloqueada";
  if (expTimestamp && new Date(expTimestamp * 1000) < new Date()) return "vencida";
  return "ok";
}

async function listarUsuarios(session: UniplaySession): Promise<any[]> {
  const res = await authFetch(session.token, `users-iptv?reg_password=${encodeURIComponent(session.cryptPass)}`);
  if (!res.ok) throw new Error(`UNIPLAY users-iptv → ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : Object.values(data);
}

export function criarUniplayAdapter(creds: ServidorCredenciais, idServidor: number): PainelAdapter {
  return {
    async listarContas(): Promise<ContaPainel[]> {
      const session = await getSession(creds, idServidor);
      const users = await listarUsuarios(session);
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
      const session = await getSession(creds, idServidor);
      const users = await listarUsuarios(session);
      const user = users.find((u: any) => u.username === usuario);
      if (!user) throw new Error(`UNIPLAY: usuário "${usuario}" não encontrado`);

      const res = await authFetch(session.token, `users-iptv/${user.id}`, {
        method: "POST",
        body: JSON.stringify({ action: 1, credits: meses, reg_password: session.cryptPass }),
      });
      if (!res.ok) throw new Error(`UNIPLAY renovar → ${res.status}`);

      // Buscar vencimento atualizado
      const updated = (await listarUsuarios(session)).find((u: any) => u.username === usuario);
      const novoVenc = updated?.exp_date_timestamp
        ? new Date(updated.exp_date_timestamp * 1000).toISOString().slice(0, 10)
        : undefined;

      if (novoVenc) {
        await pool.query(
          `UPDATE public.contas SET vencimento_real_painel = $1, status_conta = 'ok'
           WHERE id_servidor = $2 AND usuario = $3`,
          [novoVenc, idServidor, usuario]
        );
      }

      return { ok: true, novoVencimento: novoVenc };
    },
  };
}
