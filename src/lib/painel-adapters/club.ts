import { Impit, type HttpMethod } from "impit";
import type { ContaPainel, PainelAdapter, ResultadoRenovacao, ResultadoEdicao, ResultadoTeste, ServidorCredenciais, SaveSession, SaveContaVencimento } from "./types";
import { impitFetch } from "./proxy-retry";

// API: https://pdcapi.io/   Auth: X-ACCESS-TOKEN (~7 dias)
// Login: 2captcha (HCaptchaTaskProxyless) → POST pdcapi.io/login (URL-encoded)
// hCaptcha sitekey dashboard.bz: 8cf2ef3e-6e60-456a-86ca-6f2c855c3a06
// Nota: CapSolver HCaptchaTaskProxyLess testado e não resolveu este challenge

const API_URL     = "https://pdcapi.io/";
const WEBSITE_URL = "https://dashboard.bz/login.php";
const SITEKEY     = "8cf2ef3e-6e60-456a-86ca-6f2c855c3a06";
// pdcapi.io bloqueia IP do datacenter Hostinger — proxy residencial necessário
const impit       = new Impit({ browser: "chrome", proxyUrl: process.env.UNIPLAY_PROXY_URL });

// Evita múltiplos logins simultâneos para o mesmo painel (sync + status ao mesmo tempo)
const loginEmProgresso = new Map<number, Promise<string | void>>();

// Gera username aleatório: 9 chars alfanuméricos minúsculos
function gerarUsername(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 9 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// Gera senha no padrão exigido: 9 chars, ≥1 maiúscula, ≥1 dígito
function gerarSenha(): string {
  const lower  = "abcdefghijklmnopqrstuvwxyz";
  const upper  = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  const all    = lower + upper + digits;
  const parts  = [
    upper [Math.floor(Math.random() * upper.length)],
    digits[Math.floor(Math.random() * digits.length)],
    ...Array.from({ length: 7 }, () => all[Math.floor(Math.random() * all.length)]),
  ];
  return parts.sort(() => Math.random() - 0.5).join("");
}

async function resolverHCaptcha(): Promise<string> {
  const apiKey = process.env.TWOCAPTCHA_API_KEY;
  if (!apiKey) throw new Error("TWOCAPTCHA_API_KEY não definida no Easypanel.");

  let ultimoErro = "";

  // workers falham ~66% das vezes neste challenge — até 10 tentativas
  for (let tentativa = 1; tentativa <= 10; tentativa++) {
    const criacao = await fetch("https://api.2captcha.com/createTask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientKey: apiKey,
        task: { type: "HCaptchaTaskProxyless", websiteURL: WEBSITE_URL, websiteKey: SITEKEY },
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
  id: number,
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

  function dispararLogin() {
    if (loginEmProgresso.has(id)) return; // já há um login rodando para este painel
    const p = doLogin()
      .catch(() => {})
      .finally(() => loginEmProgresso.delete(id));
    loginEmProgresso.set(id, p);
  }

  // Re-login nunca bloqueia o request — qualquer ausência ou quebra de sessão
  // dispara doLogin() em background (apenas um por painel) e falha imediatamente.
  async function withRelogin<T>(fn: (token: string) => Promise<T>): Promise<T> {
    const cached = cachedToken();
    if (!cached) {
      dispararLogin();
      const jaReconectando = loginEmProgresso.has(id);
      throw new Error(
        jaReconectando
          ? "CLUB: reconectando em background (2captcha, ~5min). Aguarde e tente novamente."
          : "CLUB: sem sessão ativa — reconectando em background. Aguarde e tente novamente."
      );
    }
    try {
      return await fn(cached);
    } catch (err) {
      if (!(err instanceof ClubSessionExpiredError)) throw err;
      dispararLogin();
      throw new Error("CLUB: sessão expirada — reconectando em background. Aguarde e tente novamente.");
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
      // Apenas o bulk — 1 request. Senhas NÃO são buscadas aqui para não esgotar a sessão
      // (CLUB é sessão única: 280+ chamadas individuais invalidam o token no servidor).
      // Senhas são importadas separadamente via /importar-senhas.
      return withRelogin(async (token) => {
        const lista = await listarContasRaw(token);
        return lista.map((l: any) => ({
          usuario:    l.username,
          rotulo:     l.reseller_notes || "",
          vencimento: l.exp_date
            ? new Date(Number(l.exp_date) * 1000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
            : null,
          status: mapStatus(l.status),
          senha:  null, // sempre nulo aqui — senhas vivem no banco local
        }));
      });
    },

    // Importa senhas em batch via listas/{id}/info — chamado explicitamente, não no sync diário
    async importarSenhas(): Promise<Map<string, string | null>> {
      return withRelogin(async (token) => {
        const lista = await listarContasRaw(token);
        const BATCH = 10; // lotes menores para não stressar a sessão
        const senhas = new Map<string, string | null>();
        for (let i = 0; i < lista.length; i += BATCH) {
          const batch = lista.slice(i, i + BATCH);
          const results = await Promise.allSettled(
            batch.map((l: any) => apiFetch(token, `listas/${l.id}/info`))
          );
          results.forEach((r, idx) => {
            if (r.status === "fulfilled" && r.value?.data?.password) {
              senhas.set(batch[idx].username, r.value.data.password as string);
            } else {
              senhas.set(batch[idx].username, null);
            }
          });
          // Pausa entre lotes para não sobrecarregar a sessão
          if (i + BATCH < lista.length) await new Promise(r => setTimeout(r, 500));
        }
        return senhas;
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

    async editarConta(usuario: string, campos: { novoUsuario?: string; novaSenha?: string; novoRotulo?: string }): Promise<ResultadoEdicao> {
      return withRelogin(async (token) => {
        // Busca o id interno da conta pelo username
        const lista = await listarContasRaw(token);
        const conta = lista.find((l: any) => l.username === usuario);
        if (!conta) return { ok: false, erro: `Usuário "${usuario}" não encontrado no CLUB.` };

        const body = new URLSearchParams();
        body.set("username_edit",    campos.novoUsuario  ?? usuario);
        body.set("password_edit",    campos.novaSenha    ?? "");
        body.set("reseller_notes",   campos.novoRotulo   ?? conta.reseller_notes ?? "");
        body.set("plano_novo_edit",  conta.bouquet ?? "");

        const result = await apiFetch(token, `listas/${conta.id}/editar`, {
          method: "POST",
          body,
        });
        if (!result.result) return { ok: false, erro: result.msg ?? "Erro ao editar conta no CLUB." };
        return { ok: true };
      });
    },

    async gerarTeste({ comAdultos = false, horas = 6 } = {}): Promise<ResultadoTeste> {
      return withRelogin(async (token) => {
        const usuario = gerarUsername();
        const senha   = gerarSenha();
        const bouquet = comAdultos ? "36" : "35";

        const result = await apiFetch(token, "listas/teste", {
          method: "POST",
          body: new URLSearchParams({
            adulto:   bouquet,
            horas:    String(Math.min(Math.max(horas, 1), 6)),
            username: usuario,
            password: senha,
            nitro:    "0",
          }),
        });

        if (!result.result) return { ok: false, erro: result.msg ?? "Erro ao gerar teste no CLUB." };

        const expiracao = new Date(Date.now() + horas * 60 * 60 * 1000)
          .toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

        return { ok: true, usuario, senha, expiracao };
      });
    },
  };
}
