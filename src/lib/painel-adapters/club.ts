import { Impit, type HttpMethod } from "impit";
import type { ContaPainel, PainelAdapter, ResultadoRenovacao, ServidorCredenciais, SaveSession, SaveContaVencimento } from "./types";

// API: https://pdcapi.io/   Auth: X-ACCESS-TOKEN (~7 dias)
// Login: 2captcha (HCaptchaTask+proxy) → POST pdcapi.io/login (URL-encoded)
// hCaptcha sitekey dashboard.bz: 8cf2ef3e-6e60-456a-86ca-6f2c855c3a06

const API_URL     = "https://pdcapi.io/";
const WEBSITE_URL = "https://dashboard.bz/login.php";
const SITEKEY     = "8cf2ef3e-6e60-456a-86ca-6f2c855c3a06";
const impit       = new Impit({ browser: "chrome" });

async function resolverHCaptcha(): Promise<string> {
  const apiKey = process.env.TWOCAPTCHA_API_KEY;
  if (!apiKey) throw new Error("TWOCAPTCHA_API_KEY não definida no Easypanel.");

  let ultimoErro = "";

  // Tenta até 10 vezes sem proxy — workers falham ~66% das vezes neste challenge
  // P(falhar todas) = 0.66^10 ≈ 1.8%
  for (let tentativa = 1; tentativa <= 10; tentativa++) {
    const criacao = await fetch("https://api.2captcha.com/createTask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientKey: apiKey,
        task: {
          type: "HCaptchaTaskProxyless",
          websiteURL: WEBSITE_URL,
          websiteKey: SITEKEY,
        },
      }),
    }).then(r => r.json()) as any;

    if (criacao.errorId) {
      ultimoErro = `createTask: ${criacao.errorDescription ?? criacao.errorCode ?? criacao.errorId}`;
      continue;
    }

    const { taskId } = criacao;

    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const result = await fetch("https://api.2captcha.com/getTaskResult", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientKey: apiKey, taskId }),
      }).then(r => r.json()) as any;

      if (result.status === "ready") return result.solution.gRecaptchaResponse as string;
      if (result.errorId) {
        ultimoErro = `getTaskResult: ${result.errorDescription ?? result.errorCode}`;
        break;
      }
    }
  }
  throw new Error(`CLUB: hCaptcha não resolvido após 10 tentativas. Último erro: ${ultimoErro}`);
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
export async function loginClub(creds: ServidorCredenciais, onSaveSession: SaveSession): Promise<string> {
  const token = await loginViaCaptcha(creds.painel_usuario, creds.painel_senha);
  // Tenta ler o exp do JWT; fallback para 2h se token opaco ou exp ausente
  const expiry = parseJwtExpiry(token) ?? new Date(Date.now() + 2 * 60 * 60 * 1000);
  await onSaveSession(token, expiry);
  return token;
}

function getSession(creds: ServidorCredenciais): string {
  if (creds.session_cookie) {
    const expirado = creds.session_expiry && new Date(creds.session_expiry) <= new Date();
    if (!expirado) return creds.session_cookie;
  }
  throw new Error("CLUB: sessão expirada. Clique em 'Renovar Sessão' no card.");
}

async function apiFetch(token: string, path: string, options: { method?: HttpMethod; body?: URLSearchParams | string } = {}) {
  const res = await impit.fetch(API_URL + path, {
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
  return res.json();
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
  function obterToken(): string {
    return getSession(creds);
  }

  async function fetchComRetry(path: string, options: { method?: HttpMethod; body?: URLSearchParams | string } = {}): Promise<any> {
    const token = obterToken();
    try {
      return await apiFetch(token, path, options);
    } catch (err: any) {
      if (err.message?.includes("401") || err.message?.includes("403")) {
        throw new Error("CLUB: sessão expirada. Clique em 'Renovar Sessão' no card.");
      }
      throw err;
    }
  }

  return {
    async listarContas(): Promise<ContaPainel[]> {
      const data = await fetchComRetry("listas/minhas", {
        method: "POST",
        body: new URLSearchParams({ draw: "1", start: "0", length: "2000" }),
      });
      return (data.data ?? []).map((l: any) => ({
        usuario: l.username,
        rotulo: l.reseller_notes || "",
        vencimento: l.exp_date
          ? new Date(Number(l.exp_date) * 1000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
          : null,
        status: mapStatus(l.status),
      }));
    },

    async renovar(usuario: string, meses = 1): Promise<ResultadoRenovacao> {
      const lista = await fetchComRetry("listas/minhas", {
        method: "POST",
        body: new URLSearchParams({ draw: "1", start: "0", length: "2000" }),
      });
      const conta = (lista.data ?? []).find((l: any) => l.username === usuario);
      if (!conta) return { ok: false, erro: `Usuário "${usuario}" não encontrado no CLUB.` };

      const result = await fetchComRetry(`listas/${conta.id}/renovar`, {
        method: "POST",
        body: new URLSearchParams({ tempo: String(meses) }),
      });
      if (!result.result) return { ok: false, erro: result.msg ?? "Erro ao renovar no CLUB." };

      if (result.exp_date) {
        const novoVenc = new Date(Number(result.exp_date) * 1000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
        await onSaveContas(usuario, novoVenc);
        return { ok: true, novoVencimento: novoVenc };
      }
      return { ok: true };
    },
  };
}
