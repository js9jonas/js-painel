import type { ContaPainel, PainelAdapter, ResultadoRenovacao, ServidorCredenciais, SaveSession, SaveContaVencimento } from "./types";

// API base: https://api.controle.fit/api
// Auth: JWT Bearer, expira em 1h
// Login: Cloudflare Turnstile invisível → resolvido automaticamente via Playwright

const API_BASE = "https://api.controle.fit/api";

async function loginViaBrowser(usuario: string, senha: string): Promise<string> {
  // Import dinâmico para não quebrar bundling do webpack
  const { chromium } = await import("playwright");

  const proxyUrl = process.env.UNIPLAY_PROXY_URL;

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const ctx = await browser.newContext(
      proxyUrl ? { proxy: { server: proxyUrl } } : {}
    );
    const page = await ctx.newPage();

    await page.goto("https://painel.fun/login", {
      waitUntil: "networkidle",
      timeout: 30_000,
    });

    // Turnstile invisível — token gerado automaticamente pelo browser
    await page.waitForFunction(() => {
      const el = document.querySelector('[name="cf-turnstile-response"]');
      return el && (el as HTMLInputElement).value.length > 100;
    }, { timeout: 20_000 });

    const turnstileToken = await page.$eval(
      '[name="cf-turnstile-response"]',
      (el) => (el as HTMLInputElement).value
    );

    // Login via fetch dentro do browser (mesmo IP/sessão que gerou o token)
    const result: any = await page.evaluate(
      async ({ username, password, token }) => {
        const res = await fetch("https://api.controle.fit/api/auth/sign-in", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ username, password, "cf-turnstile-response": token }),
        });
        return res.json();
      },
      { username: usuario, password: senha, token: turnstileToken }
    );

    if (!result.token) {
      throw new Error(`Login CENTRAL falhou: ${JSON.stringify(result.message ?? result)}`);
    }

    return result.token as string;
  } finally {
    await browser.close();
  }
}

async function getSession(
  creds: ServidorCredenciais,
  onSaveSession: SaveSession
): Promise<string> {
  if (creds.session_cookie) {
    const expirado = creds.session_expiry && new Date(creds.session_expiry) <= new Date();
    if (!expirado) return creds.session_cookie;
  }
  return freshLogin(creds.painel_usuario, creds.painel_senha, onSaveSession);
}

async function freshLogin(
  usuario: string,
  senha: string,
  onSaveSession: SaveSession
): Promise<string> {
  const token = await loginViaBrowser(usuario, senha);
  // Salva com 55min de validade (token expira em 1h)
  const expiresAt = new Date(Date.now() + 55 * 60 * 1000);
  await onSaveSession(token, expiresAt);
  return token;
}

async function apiFetch(token: string, path: string, options: RequestInit = {}) {
  const res = await fetch(`${API_BASE}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`controle.fit/${path} → ${res.status}: ${msg.substring(0, 200)}`);
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
      if (err.message?.includes("401") || err.message?.includes("403")) {
        // Token expirou — força novo login
        _sessionPromise = freshLogin(creds.painel_usuario, creds.painel_senha, onSaveSession);
        const novoToken = await _sessionPromise;
        return apiFetch(novoToken, path, options);
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
        const data = await fetchComRetry(
          `users?page=${page}&per=${per}&reseller=${creds.painel_usuario}`
        );
        const users: any[] = data.data ?? [];
        allUsers.push(...users);
        if (allUsers.length >= (data.meta?.total ?? 0) || users.length < per) break;
        page++;
      }

      return allUsers.map((u: any) => ({
        usuario: u.username,
        rotulo: u.reseller_notes || u.full_name || "",
        vencimento: u.exp_date
          ? new Date(Number(u.exp_date) * 1000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
          : null,
        status: mapStatus(u.enabled ?? 1, u.exp_date ?? 0),
      }));
    },

    async renovar(usuario: string, _meses = 1): Promise<ResultadoRenovacao> {
      // Busca ID interno pelo username
      let page = 1;
      const per = 100;
      let conta: any = null;

      while (!conta) {
        const data = await fetchComRetry(
          `users?page=${page}&per=${per}&reseller=${creds.painel_usuario}`
        );
        const users: any[] = data.data ?? [];
        conta = users.find((u: any) => u.username === usuario);
        if (!conta && users.length < per) break;
        page++;
      }

      if (!conta) return { ok: false, erro: `Usuário "${usuario}" não encontrado no CENTRAL.` };

      // mounth (typo intencional do servidor)
      const result = await fetchComRetry(`users/${conta.id}/renew`, {
        method: "POST",
        body: JSON.stringify({ mounth: 1 }),
      });

      const novoVenc = result.exp_date
        ? new Date(Number(result.exp_date) * 1000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
        : undefined;

      if (novoVenc) await onSaveContas(usuario, novoVenc);
      return { ok: true, novoVencimento: novoVenc };
    },
  };
}
