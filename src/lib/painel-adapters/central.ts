import { Impit } from "impit";
import type { ContaPainel, PainelAdapter, ResultadoRenovacao, ResultadoEdicao, ResultadoTeste, ServidorCredenciais, SaveSession, SaveContaVencimento } from "./types";

// API base: https://api.controle.fit/api
// Auth: JWT Bearer, expira em 1h
// Login: Cloudflare Turnstile resolvido via CapSolver (sitekey 0x4AAAAAACFhU7XJduqvbHH2)

const API_BASE              = "https://api.controle.fit/api";
const SITEKEY               = "0x4AAAAAACFhU7XJduqvbHH2";
const WEBSITE_URL           = "https://painel.fun/login";
const RECAPTCHA_SITEKEY     = "6LeJTpIeAAAAALiuQPGPcaXbs9XL-cKdwEBuOmJ7";
const RECAPTCHA_WEBSITE_URL = "https://painel.fun/users";
const impit                 = new Impit({ browser: "chrome" });

async function resolverTurnstile(): Promise<string> {
  const apiKey = process.env.CAPSOLVER_API_KEY;
  if (!apiKey) throw new Error("CAPSOLVER_API_KEY não definida no Easypanel.");

  const { taskId, errorId, errorDescription } = await fetch("https://api.capsolver.com/createTask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientKey: apiKey,
      task: { type: "AntiTurnstileTaskProxyLess", websiteURL: WEBSITE_URL, websiteKey: SITEKEY },
    }),
  }).then(r => r.json()) as any;

  if (errorId) throw new Error(`CapSolver erro ao criar tarefa: ${errorDescription}`);

  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const result = await fetch("https://api.capsolver.com/getTaskResult", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientKey: apiKey, taskId }),
    }).then(r => r.json()) as any;

    if (result.status === "ready")  return result.solution.token as string;
    if (result.status === "failed") throw new Error(`CapSolver falhou: ${result.errorDescription}`);
  }
  throw new Error("CapSolver timeout após 60s.");
}

// reCAPTCHA Enterprise para criação de usuários (sitekey do painel.fun)
async function resolverReCaptchaEnterprise(): Promise<string | null> {
  const apiKey = process.env.CAPSOLVER_API_KEY;
  if (!apiKey) return null;

  const { taskId, errorId } = await fetch("https://api.capsolver.com/createTask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientKey: apiKey,
      task: { type: "ReCaptchaV2EnterpriseTaskProxyLess", websiteURL: RECAPTCHA_WEBSITE_URL, websiteKey: RECAPTCHA_SITEKEY },
    }),
  }).then(r => r.json()) as any;

  if (errorId) return null;

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const result = await fetch("https://api.capsolver.com/getTaskResult", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientKey: apiKey, taskId }),
    }).then(r => r.json()) as any;

    if (result.status === "ready")  return result.solution.gRecaptchaResponse as string;
    if (result.status === "failed") return null;
  }
  return null;
}

// Credenciais no padrão CENTRAL: 6 chars, lowercase + números (igual ao gerador do painel)
function gerarCredencialCentral(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

async function loginViaCapSolver(usuario: string, senha: string): Promise<string> {
  const turnstileToken = await resolverTurnstile();
  const res = await impit.fetch(`${API_BASE}/auth/sign-in`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: "https://painel.fun",
      Referer: "https://painel.fun/",
    },
    body: JSON.stringify({ username: usuario, password: senha, "cf-turnstile-response": turnstileToken }),
  });
  if (!res.ok) throw new Error(`Login CENTRAL → ${res.status}`);
  const data = await res.json() as any;
  if (!data.token) throw new Error(`Login CENTRAL falhou: ${JSON.stringify(data.message ?? data)}`);
  return data.token as string;
}

async function getSession(creds: ServidorCredenciais, onSaveSession: SaveSession): Promise<string> {
  if (creds.session_cookie) {
    const expirado = creds.session_expiry && new Date(creds.session_expiry) <= new Date();
    if (!expirado) return creds.session_cookie;
  }
  return freshLogin(creds.painel_usuario, creds.painel_senha, onSaveSession);
}

async function freshLogin(usuario: string, senha: string, onSaveSession: SaveSession): Promise<string> {
  const token = await loginViaCapSolver(usuario, senha);
  await onSaveSession(token, new Date(Date.now() + 55 * 60 * 1000));
  return token;
}

async function apiFetch(token: string, path: string, options: RequestInit = {}) {
  // 25/08/2026: trocado de `fetch` global pra `impit.fetch` (mesma lib usada no login).
  // Confirmado via captura de rede de um clique real em "Renovar por 1 mês" no navegador
  // (mesmo endpoint, mesmo body `{mounth:1}`) que funciona — a diferença não é header
  // nem token, é a impressão digital de rede (TLS/HTTP2) da chamada. `fetch` puro do Node
  // não imita um Chrome de verdade; `impit` sim (é pra isso que ele existe, já usado no
  // login via CapSolver). A controle.fit passou a exigir isso também em ações de escrita
  // (ex: /renew), não só no login — daí o 403 "sessao_nao_renderizada" mesmo com token válido.
  // impit tem seu próprio tipo de opções (method restrito a HttpMethod, body sem
  // aceitar null, etc.), incompatível ponto a ponto com o `RequestInit` padrão do
  // apiFetch — cast pro `any` aqui só pra satisfazer o TS, sem mudar nada em runtime
  // (a lib aceita as mesmas opções de sempre: method string, headers, body string).
  const res = await impit.fetch(`${API_BASE}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Origin: "https://painel.fun",
      Referer: "https://painel.fun/",
      ...(options.headers ?? {}),
    },
  } as any);
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    const err = new Error(`controle.fit/${path} → ${res.status}: ${msg.substring(0, 200)}`);
    // Expõe o "code" do corpo (quando existe) pra quem chama decidir se vale tentar
    // de novo com login novo — ver nota em fetchComRetry sobre "sessao_nao_renderizada".
    try { (err as any).code = JSON.parse(msg)?.code; } catch {}
    throw err;
  }
  return res.json();
}

function mapStatus(enabled: number, expDate: number): ContaPainel["status"] {
  if (enabled === 0) return "bloqueada";
  if (expDate && new Date(expDate * 1000) < new Date()) return "vencida";
  return "ok";
}

export function criarCentralAdapter(
  creds: ServidorCredenciais,
  _id: number,
  onSaveSession: SaveSession,
  onSaveContas: SaveContaVencimento
): PainelAdapter {
  let _sessionPromise: Promise<string> | null = null;

  function obterToken(): Promise<string> {
    if (!_sessionPromise) _sessionPromise = getSession(creds, onSaveSession);
    return _sessionPromise;
  }

  async function fetchComRetry(path: string, options: RequestInit = {}): Promise<any> {
    const token = await obterToken();
    try {
      return await apiFetch(token, path, options);
    } catch (err: any) {
      // "sessao_nao_renderizada" não é sessão expirada — é a controle.fit rejeitando a
      // origem da chamada (provável verificação de IP/dispositivo em ações de escrita,
      // ver docs/memoria/incident_central_sessao_nao_renderizada.md). Gerar login novo via
      // CapSolver não resolve isso e ainda destrói uma sessão boa que já estava salva —
      // não fazer retry nesse caso, só propagar o erro original.
      if (err.code === "sessao_nao_renderizada") throw err;

      if (err.message?.includes("401") || err.message?.includes("403")) {
        _sessionPromise = freshLogin(creds.painel_usuario, creds.painel_senha, onSaveSession);
        return apiFetch(await _sessionPromise, path, options);
      }
      throw err;
    }
  }

  return {
    async listarContas(): Promise<ContaPainel[]> {
      const allUsers: any[] = [];
      let page = 1;
      const per = 100;
      while (true) {
        const data = await fetchComRetry(`users?page=${page}&per=${per}&reseller=${creds.painel_usuario}`);
        const users: any[] = data.data ?? [];
        allUsers.push(...users);
        if (allUsers.length >= (data.meta?.total ?? 0) || users.length < per) break;
        page++;
      }
      return allUsers.map((u: any) => ({
        usuario:    u.username,
        rotulo:     u.reseller_notes || u.full_name || "",
        vencimento: u.exp_date
          ? new Date(Number(u.exp_date) * 1000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
          : null,
        status: mapStatus(u.enabled ?? 1, u.exp_date ?? 0),
        senha:  u.password ?? null,
      }));
    },

    async getCreditos(): Promise<number | null> {
      try {
        const data = await fetchComRetry("profile");
        return data.credits != null ? parseFloat(data.credits) : null;
      } catch {
        return null;
      }
    },

    async renovar(usuario: string, _meses = 1): Promise<ResultadoRenovacao> {
      let page = 1;
      const per = 100;
      let conta: any = null;
      while (!conta) {
        const data = await fetchComRetry(`users?page=${page}&per=${per}&reseller=${creds.painel_usuario}`);
        const users: any[] = data.data ?? [];
        conta = users.find((u: any) => u.username === usuario);
        if (!conta && users.length < per) break;
        page++;
      }
      if (!conta) return { ok: false, erro: `Usuário "${usuario}" não encontrado no CENTRAL.` };

      // mounth (typo intencional do servidor)
      // 25/08/2026: removida a chamada extra a set-expiry-time — a controle.fit passou a
      // cravar o vencimento em 23:59 direto na resposta do /renew (confirmado via captura de
      // rede de um clique real em "Renovar por 1 mês": só o /renew disparou, sem segunda
      // chamada, e o vencimento já veio certo). A chamada extra ficou redundante e é a
      // suspeita mais provável para o erro de renew relatado no js-painel.
      const renewed = await fetchComRetry(`users/${conta.id}/renew`, {
        method: "POST",
        body: JSON.stringify({ mounth: 1 }),
      });
      const expTs = renewed?.exp_date;

      const novoVenc = expTs
        ? new Date(Number(expTs) * 1000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
        : undefined;
      if (novoVenc) await onSaveContas(usuario, novoVenc);
      return { ok: true, novoVencimento: novoVenc };
    },

    async editarConta(usuario: string, campos: { novoUsuario?: string; novaSenha?: string; novoRotulo?: string }): Promise<ResultadoEdicao> {
      // Localiza a conta pelo username para obter o id interno
      let conta: any = null;
      let page = 1;
      while (!conta) {
        const data = await fetchComRetry(`users?page=${page}&per=100&reseller=${creds.painel_usuario}`);
        const users: any[] = data.data ?? [];
        conta = users.find((u: any) => u.username === usuario);
        if (!conta && users.length < 100) break;
        page++;
      }
      if (!conta) return { ok: false, erro: `Usuário "${usuario}" não encontrado no CENTRAL.` };

      const body: Record<string, any> = {
        username:        campos.novoUsuario  ?? conta.username,
        reseller_notes:  campos.novoRotulo   ?? conta.reseller_notes ?? "",
      };
      if (campos.novaSenha) body.password = campos.novaSenha;

      await fetchComRetry(`users/${conta.id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      return { ok: true };
    },

    async gerarTeste({ comAdultos = false, rotulo = "" } = {}): Promise<ResultadoTeste> {
      const usuario    = gerarCredencialCentral();
      const senha      = gerarCredencialCentral();
      const packageId  = comAdultos ? 62 : 61;
      const recaptcha  = await resolverReCaptchaEnterprise();

      await fetchComRetry("trial_users", {
        method: "POST",
        body: JSON.stringify({
          username:               usuario,
          password:               senha,
          full_name:              rotulo,
          as_number:              "",
          type:                   1,
          max_connections:        1,
          is_trial:               true,
          package_id:             packageId,
          adult_channels:         comAdultos,
          "g-recaptcha-response": recaptcha,
          official_credits:       0,
          isIPTV:                 true,
        }),
      });

      // Duração fixa de 3h (determinada pelo package 61/62 no servidor)
      const expDate = new Date(Date.now() + 3 * 60 * 60 * 1000);
      const expiracao = expDate.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      const expiracaoHorario = expDate.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

      return { ok: true, usuario, senha, expiracao, expiracaoHorario };
    },

    async deletarConta(usuario: string): Promise<void> {
      // Localiza o id interno iterando páginas (API não tem busca por username)
      let idInterno: number | null = null;
      let page = 1;
      while (idInterno === null) {
        const data = await fetchComRetry(`users?page=${page}&per=100&reseller=${creds.painel_usuario}`);
        const users: any[] = data.data ?? [];
        const found = users.find((u: any) => u.username === usuario);
        if (found) { idInterno = found.id; break; }
        if (users.length < 100) break;
        page++;
      }
      if (idInterno === null) throw new Error(`CENTRAL: usuário "${usuario}" não encontrado.`);

      const token = await obterToken();
      const res = await fetch(`${API_BASE}/users/${idInterno}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        throw new Error(`CENTRAL deletar → ${res.status}: ${msg.slice(0, 200)}`);
      }
    },
  };
}
