import { Impit, type HttpMethod } from "impit";
import type { ContaPainel, PainelAdapter, ResultadoRenovacao, ResultadoEdicao, ResultadoTeste, ServidorCredenciais, SaveSession, SaveContaVencimento } from "./types";
import { impitFetch } from "./proxy-retry";

// API base: https://gesapioffice.com/api
// Auth: JWT Bearer — auto-login com TLS Chrome (via impit)
// Sessão: ~6h — renovada automaticamente via login

const API_BASE = "https://gesapioffice.com/api";

// Instância global reutilizada entre requisições — imita TLS Chrome
// proxyUrl roteia via proxy residencial (bypassa bloqueio de IP do datacenter)
const impit = new Impit({ browser: "chrome", proxyUrl: process.env.UNIPLAY_PROXY_URL });

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
  const res = await impitFetch(impit, `${API_BASE}/login`, {
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
  return impitFetch(impit, `${API_BASE}/${path}`, {
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
  function resetarSessao(nova: UniplaySession) {
    _sessionPromise = Promise.resolve(nova);
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
          ? new Date(u.exp_date_timestamp * 1000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
          : null,
        status: mapStatus(u.status, u.exp_date_timestamp ?? 0),
        senha: u.password ?? null,
      }));
    },

    async renovar(usuario: string, meses = 1): Promise<ResultadoRenovacao> {
      const session = await obterSessao();
      const users = await listar(session);
      const user = users.find((u: any) => u.username === usuario);
      if (!user) throw new Error(`UNIPLAY: usuário "${usuario}" não encontrado`);

      // Endpoint mudou de POST para PUT. PUT via proxy Webshare funciona (POST dava timeout).
      // Resposta: string "DD/MM/YYYY HH:mm:ss" com novo vencimento
      const res = await authFetch(session.token, `users-iptv/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ action: 1, credits: meses, reg_password: session.cryptPass }),
      });
      if (!res.ok) throw new Error(`UNIPLAY renovar → ${res.status}`);

      // Ajusta o horário de vencimento para 23:59:59 BRT após a renovação
      const resAjuste = await authFetch(session.token, `users-iptv/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ action: 10 }),
      });

      // Usa a data da resposta do ajuste (já em 23:59); cai de volta na renovação se falhar
      let novoVenc: string | undefined;
      const resTexto = resAjuste.ok ? await resAjuste.text() : await res.text();
      try {
        const dateStr: string = JSON.parse(resTexto);
        const m = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (m) novoVenc = `${m[3]}-${m[2]}-${m[1]}`;
      } catch { /* sem data — segue sem novoVencimento */ }

      if (novoVenc) await onSaveContas(usuario, novoVenc);
      return { ok: true, novoVencimento: novoVenc };
    },

    async getCreditos(): Promise<number | null> {
      try {
        let session = await obterSessao();
        let res = await authFetch(session.token, "dash-reseller");
        if (res.status === 401 || res.status === 404) {
          session = await freshLogin(onSaveSession, creds.painel_usuario, creds.painel_senha);
          resetarSessao(session);
          res = await authFetch(session.token, "dash-reseller");
        }
        if (!res.ok) return null;
        const data = await res.json() as any;
        return data.credits != null ? parseFloat(data.credits) : null;
      } catch {
        return null;
      }
    },

    async editarConta(usuario: string, campos: { novoRotulo?: string; novoPacote?: number }): Promise<ResultadoEdicao> {
      const session = await obterSessao();
      const users = await listar(session);
      const user = users.find((u: any) => u.username === String(usuario));
      if (!user) return { ok: false, erro: `Usuário "${usuario}" não encontrado no UNIPLAY.` };

      const res = await authFetch(session.token, `users-iptv/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({
          action:          3,
          nota:            campos.novoRotulo   ?? user.nota ?? "",
          package:         campos.novoPacote   ?? 0,
          username:        user.username,
          reg_password:    session.cryptPass,
          id_iptv:         user.id,
          isCustomPackage: false,
          bouquets:        [],
          whatsapp:        user.whatsapp ?? "+550",
          exp_day:         0,
          flagVencimento:  0,
        }),
      });
      if (!res.ok) throw new Error(`UNIPLAY editar → ${res.status}`);
      return { ok: true };
    },

    async gerarTeste({ horas = 6, rotulo = "" } = {}): Promise<ResultadoTeste> {
      const session = await obterSessao();
      const res = await authFetch(session.token, "users-iptv", {
        method: "POST",
        body: JSON.stringify({
          isOficial:       false,
          package:         "1",
          credits:         1,
          isCustomPackage: false,
          nota:            rotulo,
          test_hours:      String(Math.min(Math.max(horas, 1), 6)),
        }),
      });
      if (!res.ok) throw new Error(`UNIPLAY gerarTeste → ${res.status}`);
      const data = await res.json() as any;
      const expiracao = data.exp_date
        ? new Date(data.exp_date).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
        : undefined;
      return { ok: true, usuario: String(data.username), senha: data.password, expiracao };
    },

    async recriarlinha(usuario: string): Promise<ResultadoTeste> {
      const session = await obterSessao();
      const users = await listar(session);
      const user = users.find((u: any) => u.username === String(usuario));
      if (!user) return { ok: false, erro: `Usuário "${usuario}" não encontrado no UNIPLAY.` };

      const res = await authFetch(session.token, `recreate-line/${user.id}`, {
        method: "PUT",
        body: "",
      });
      if (!res.ok) throw new Error(`UNIPLAY recriarlinha → ${res.status}`);
      const data = await res.json() as any;
      const expiracao = data.exp_date
        ? new Date(data.exp_date).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
        : undefined;
      return { ok: true, usuario: String(data.username), senha: data.password, expiracao };
    },
  };
}
