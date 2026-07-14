import { Impit } from "impit";
import { impitFetch } from "./proxy-retry";
import type { ContaPainel, PainelAdapter, ResultadoRenovacao, ResultadoEdicao, ResultadoTeste, ServidorCredenciais, SaveSession, SaveContaVencimento } from "./types";

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
  if (res.status === 401 || res.status === 403) throw new LiebeUnauthorizedError();
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`LIEBE GET ${path} → ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return res.json();
}

async function liebePost(token: string, path: string, body?: object): Promise<any> {
  const res = await impitFetch(impit, `${API_BASE}${path}`, {
    method: "POST",
    headers: baseHeaders(token),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 || res.status === 403) throw new LiebeUnauthorizedError();
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LIEBE POST ${path} → ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
  return res.json();
}

async function liebeDelete(token: string, path: string): Promise<void> {
  const res = await impitFetch(impit, `${API_BASE}${path}`, {
    method: "DELETE",
    headers: baseHeaders(token),
  });
  if (res.status === 401 || res.status === 403) throw new LiebeUnauthorizedError();
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LIEBE DELETE ${path} → ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
}

async function liebePut(token: string, path: string, body?: object): Promise<any> {
  const res = await impitFetch(impit, `${API_BASE}${path}`, {
    method: "PUT",
    headers: baseHeaders(token),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 || res.status === 403) throw new LiebeUnauthorizedError();
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LIEBE PUT ${path} → ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
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
          senha:      c.password ?? null,
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

    async editarConta(usuario: string, campos: { novoUsuario?: string; novaSenha?: string; novoRotulo?: string }): Promise<ResultadoEdicao> {
      return withRelogin(async (token) => {
        // Busca pelo username para obter o slug interno
        const listJson = await liebeGet(token, `/customers?page=1&username=${encodeURIComponent(usuario)}&perPage=20`);
        const conta = (listJson.data ?? []).find((c: any) => c.username === usuario);
        if (!conta) return { ok: false, erro: `LIEBE: usuário "${usuario}" não encontrado.` };

        // Busca objeto completo — o PUT exige o payload completo do cliente
        const fullJson = await liebeGet(token, `/customers/${conta.id}`);
        const full: Record<string, any> = { ...(fullJson.data ?? fullJson) };

        if (campos.novoUsuario !== undefined) full.username = campos.novoUsuario;
        if (campos.novaSenha  !== undefined)  full.password = campos.novaSenha;
        if (campos.novoRotulo !== undefined)  full.note     = campos.novoRotulo;

        await liebePut(token, `/customers/${conta.id}`, full);
        return { ok: true };
      });
    },

    async gerarTeste({ comAdultos = false, rotulo = "" } = {}): Promise<ResultadoTeste> {
      return withRelogin(async (token) => {
        // Lista servidores para encontrar pacote de teste adequado
        const serversJson = await liebeGet(token, "/servers");
        const servers: any[] = serversJson.data ?? [];

        let serverId: string | null = null;
        let packageId: string | null = null;
        let packageDuration = 6;

        for (const server of servers) {
          const pkgs: any[] = server.packages ?? [];
          const candidatos = pkgs.filter((p: any) =>
            p.is_trial === "YES" && p.status === "ACTIVE" && p.is_adult === comAdultos,
          );
          // Prefere o pacote de 24h como padrão (confirmado disponível); cai pro primeiro achado se não houver
          const pkg = candidatos.find((p: any) => p.duration === 24) ?? candidatos[0];
          if (pkg) {
            serverId       = server.id;
            packageId      = pkg.id;
            packageDuration = pkg.duration;
            break;
          }
        }

        if (!serverId || !packageId) throw new Error("LIEBE: nenhum pacote de teste disponível.");

        const result = await liebePost(token, "/customers", {
          server_id:   serverId,
          package_id:  packageId,
          trial_hours: packageDuration,
          connections: 1,
          name:        rotulo,
        });

        const customer = result.data ?? result;
        const expiracao = customer.expires_at_tz?.slice(0, 10) ?? undefined;
        const expiracaoHorario = customer.expires_at_tz?.slice(11, 16) ?? undefined;
        return { ok: true, usuario: String(customer.username), senha: String(customer.password), expiracao, expiracaoHorario };
      });
    },

    async deletarConta(usuario: string): Promise<void> {
      return withRelogin(async (token) => {
        const listJson = await liebeGet(token, `/customers?page=1&username=${encodeURIComponent(usuario)}&perPage=20`);
        const conta = (listJson.data ?? []).find((c: any) => c.username === usuario);
        if (!conta) throw new Error(`LIEBE: usuário "${usuario}" não encontrado.`);
        await liebeDelete(token, `/customers/${conta.id}`);
      });
    },
  };
}
