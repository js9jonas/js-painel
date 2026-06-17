import { Impit, type HttpMethod } from "impit";
import type { ContaPainel, PainelAdapter, ResultadoRenovacao, ServidorCredenciais, SaveSession, SaveContaVencimento } from "./types";
import { impitFetch } from "./proxy-retry";

// API: https://pdcapi.io/   Auth: X-ACCESS-TOKEN (~7 dias)
// Login: CapSolver (HCaptchaTaskProxyLess) → POST pdcapi.io/login (URL-encoded)
// hCaptcha sitekey dashboard.bz: 8cf2ef3e-6e60-456a-86ca-6f2c855c3a06

const API_URL     = "https://pdcapi.io/";
const WEBSITE_URL = "https://dashboard.bz/login.php";
const SITEKEY     = "8cf2ef3e-6e60-456a-86ca-6f2c855c3a06";
// pdcapi.io bloqueia IP do datacenter Hostinger — proxy residencial necessário
const impit       = new Impit({ browser: "chrome", proxyUrl: process.env.UNIPLAY_PROXY_URL });

async function resolverHCaptcha(): Promise<string> {
  const apiKey = process.env.CAPSOLVER_API_KEY;
  if (!apiKey) throw new Error("CAPSOLVER_API_KEY não definida no Easypanel.");

  const { taskId, errorId, errorDescription } = await fetch("https://api.capsolver.com/createTask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientKey: apiKey,
      task: { type: "HCaptchaTaskProxyLess", websiteURL: WEBSITE_URL, websiteKey: SITEKEY },
    }),
  }).then(r => r.json()) as any;

  if (errorId) throw new Error(`CapSolver erro ao criar tarefa: ${errorDescription}`);

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const result = await fetch("https://api.capsolver.com/getTaskResult", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientKey: apiKey, taskId }),
    }).then(r => r.json()) as any;

    if (result.status === "ready")  return result.solution.gRecaptchaResponse as string;
    if (result.status === "failed") throw new Error(`CapSolver falhou: ${result.errorDescription}`);
  }
  throw new Error("CapSolver timeout após 90s.");
}

async function loginViaCaptcha(usuario: string, senha: string): Promise<string> {
  const hcapToken = await resolverHCaptcha();

  const res = await impit.fetch(`${API_URL}login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      "Origin": "https://dashboard.bz",
      "Referer": "https://dashboard.bz/login.php",
    },
    body: new URLSearchParams({
      username: usuario,
      password: senha,
      email: "",
      "g-recaptcha-response": hcapToken,
      "h-captcha-response": hcapToken,
    }).toString(),
  });

  if (!res.ok) throw new Error(`CLUB login → ${res.status}`);
  const data = await res.json() as any;
  if (!data.result || !data.token) {
    throw new Error(`CLUB login falhou: ${data.msg ?? JSON.stringify(data)}`);
  }
  return data.token as string;
}

function parseJwtExpiry(token: string): Date | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return payload.exp ? new Date(Number(payload.exp) * 1000) : null;
  } catch { return null; }
}

// Exposta para uso no endpoint /renovar-sessao (operação longa, fora do status check)
export async function loginClub(creds: ServidorCredenciais, onSaveSession: SaveSession): Promise<{ token: string; expiry: Date }> {
  const token = await loginViaCaptcha(creds.painel_usuario, creds.painel_senha);
  // Tenta ler o exp do JWT; fallback para 2h se token opaco ou exp ausente
  const expiry = parseJwtExpiry(token) ?? new Date(Date.now() + 2 * 60 * 60 * 1000);
  await onSaveSession(token, expiry);
  return { token, expiry };
}

// pdcapi.io responde HTTP 200 com {result:false, msg:"A sessão está expirada (N)"}
// para token morto — não é um erro HTTP, então precisa ser detectado no corpo da resposta.
class ClubSessionExpiredError extends Error {}

async function apiFetch(token: string, path: string, options: { method?: HttpMethod; body?: URLSearchParams | string } = {}) {
  const res = await impitFetch(impit, API_URL + path, {
    method: options.method ?? "GET",
    body: options.body instanceof URLSearchParams ? options.body.toString() : options.body,
    headers: {
      "X-ACCESS-TOKEN": token,
      "Content-Type": "application/x-www-form-urlencoded",
      "Origin": "https://dashboard.bz",
      "Referer": "https://dashboard.bz/",
    },
  });
  if (!res.ok) throw new Error(`pdcapi.io/${path} → ${res.status}`);
  const data = await res.json() as any;
  if (data?.result === false && /expirad/i.test(data.msg ?? "")) {
    throw new ClubSessionExpiredError(data.msg);
  }
  return data;
}

function mapStatus(s: string | number): ContaPainel["status"] {
  if (String(s) === "1") return "ok";
  if (String(s) === "0") return "bloqueada";
  return "vencida";
}

export function criarClubAdapter(
  creds: ServidorCredenciais,
  _id: number,
  onSaveSession: SaveSession,
  onSaveContas: SaveContaVencimento
): PainelAdapter {
  let sessionCache = creds.session_cookie ?? "";
  let expiryCache = creds.session_expiry;

  async function doLogin(): Promise<string> {
    const { token, expiry } = await loginClub(creds, onSaveSession);
    sessionCache = token;
    expiryCache = expiry;
    return token;
  }

  function cachedToken(): string | null {
    if (!sessionCache) return null;
    const expirado = expiryCache && new Date(expiryCache) <= new Date();
    return expirado ? null : sessionCache;
  }

  // Quando a sessão expira (por tempo ou por login em outro dispositivo), dispara
  // o re-login em background e falha imediatamente com mensagem orientando retry.
  // Isso evita bloquear o request por 90s e o timeout do proxy reverso (Traefik).
  async function withRelogin<T>(fn: (token: string) => Promise<T>): Promise<T> {
    const token = cachedToken() ?? (await doLogin());
    try {
      return await fn(token);
    } catch (err) {
      if (!(err instanceof ClubSessionExpiredError)) throw err;
      doLogin().catch(() => {}); // re-login em background, não bloqueia
      throw new Error("CLUB: sessão expirada — reconectando em background. Aguarde ~15s e sincronize novamente.");
    }
  }

  async function listarContasRaw(token: string) {
    const data = await apiFetch(token, "listas/minhas", {
      method: "POST",
      body: new URLSearchParams({ draw: "1", start: "0", length: "2000" }),
    });
    return (data.data ?? []) as any[];
  }

  return {
    async listarContas(): Promise<ContaPainel[]> {
      return withRelogin(async (token) => {
        const lista = await listarContasRaw(token);
        return lista.map((l: any) => ({
          usuario: l.username,
          rotulo: l.reseller_notes || "",
          vencimento: l.exp_date
            ? new Date(Number(l.exp_date) * 1000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
            : null,
          status: mapStatus(l.status),
        }));
      });
    },

    async getCreditos(): Promise<number | null> {
      try {
        return await withRelogin(async (token) => {
          const res = await impitFetch(impit, `${API_URL}stats`, {
            method: "GET",
            headers: {
              "X-ACCESS-TOKEN": token,
              "X_FILTRO": "1",
              "Origin": "https://dashboard.bz",
              "Referer": "https://dashboard.bz/",
            },
          });
          if (!res.ok) throw new Error(`CLUB stats → ${res.status}`);
          const data = await res.json() as any;
          if (data?.result === false && /expirad/i.test(data.msg ?? "")) {
            throw new ClubSessionExpiredError(data.msg);
          }
          return data?.data?.credits != null ? parseFloat(data.data.credits) : null;
        });
      } catch {
        return null;
      }
    },

    async renovar(usuario: string, meses = 1): Promise<ResultadoRenovacao> {
      return withRelogin(async (token) => {
        const lista = await listarContasRaw(token);
        const conta = lista.find((l: any) => l.username === usuario);
        if (!conta) return { ok: false, erro: `Usuário "${usuario}" não encontrado no CLUB.` };

        const result = await apiFetch(token, `listas/${conta.id}/renovar`, {
          method: "POST",
          body: new URLSearchParams({ tempo: String(meses) }),
        });
        if (!result.result) return { ok: false, erro: result.msg ?? "Erro ao renovar no CLUB." };

        // exp_date pode vir na resposta do renovar OU precisar ser buscado na listagem atualizada
        // (pequeno delay porque a API às vezes ainda não refletiu o novo vencimento na listagem)
        let expRaw = result.exp_date;
        if (!expRaw) {
          await new Promise((r) => setTimeout(r, 2000));
          expRaw = (await listarContasRaw(token)).find((l: any) => l.username === usuario)?.exp_date;
        }

        if (expRaw) {
          const novoVenc = new Date(Number(expRaw) * 1000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
          await onSaveContas(usuario, novoVenc);
          return { ok: true, novoVencimento: novoVenc };
        }
        return { ok: true };
      });
    },
  };
}
