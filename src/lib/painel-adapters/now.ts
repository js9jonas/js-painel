import type { ContaPainel, PainelAdapter, ResultadoRenovacao, ServidorCredenciais, SaveSession, SaveContaVencimento } from "./types";

// Painel N (pnw7.cc) — PHP session + reCAPTCHA v2
// Auto-login: CapSolver ReCaptchaV2TaskProxyLess → POST validar-login.php → PHPSESSID no Set-Cookie
// Sessão expira ~24h; renovada automaticamente quando necessário.

const BASE_URL = "https://pnw7.cc/painel";
const SITEKEY  = "6Lf3ccgUAAAAAH5oBq0mVN-RhDu6MDwZ3pZxVKtl";

function getCodrev(painelUrl: string): string {
  const match = painelUrl.match(/z=(.+)$/);
  return match ? `z=${match[1]}` : "";
}

function cookieHeader(session: string, codrev: string): string {
  return `${session}; codeRev=${encodeURIComponent(codrev)}`;
}

function phpFetch(session: string, codrev: string, path: string, body: URLSearchParams) {
  return fetch(`${BASE_URL}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieHeader(session, codrev),
    },
    body: body.toString(),
  });
}

async function resolverRecaptcha(websiteURL: string): Promise<string> {
  const apiKey = process.env.CAPSOLVER_API_KEY;
  if (!apiKey) throw new Error("CAPSOLVER_API_KEY não definida.");

  const created = await fetch("https://api.capsolver.com/createTask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientKey: apiKey,
      task: { type: "ReCaptchaV2TaskProxyLess", websiteURL, websiteKey: SITEKEY },
    }),
  }).then(r => r.json()) as any;

  if (created.errorId) throw new Error(`CapSolver erro: ${created.errorDescription}`);

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const result = await fetch("https://api.capsolver.com/getTaskResult", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientKey: apiKey, taskId: created.taskId }),
    }).then(r => r.json()) as any;
    if (result.status === "ready")  return result.solution.gRecaptchaResponse as string;
    if (result.status === "failed") throw new Error(`CapSolver falhou: ${result.errorDescription}`);
  }
  throw new Error("CapSolver timeout após 90s.");
}

async function loginNow(painelUrl: string, usuario: string, senha: string): Promise<string> {
  const codrev = getCodrev(painelUrl);
  const recaptchaToken = await resolverRecaptcha(painelUrl);

  const body = new URLSearchParams({
    usuario,
    senha,
    codrev,
    "captcha-response": recaptchaToken,
  });

  const res = await fetch(`${BASE_URL}/validar-login.php`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: painelUrl,
      Cookie: `codeRev=${encodeURIComponent(codrev)}`,
    },
    body: body.toString(),
    redirect: "manual",
  });

  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/PHPSESSID=([^;]+)/);
  if (!match) throw new Error("NOW login falhou — PHPSESSID ausente na resposta.");
  return `PHPSESSID=${match[1]}`;
}

function parseUsername(cell0: string): string {
  const m = cell0.match(/value="([^"]+)"/);
  return m ? m[1] : "";
}

function parseNome(cell1: string): string {
  return cell1.replace(/<br[\s\S]*/, "").replace(/<[^>]+>/g, "").trim();
}

function parseVencimento(cell3: string): string | null {
  const m = cell3.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function parseStatus(cell3: string): ContaPainel["status"] {
  if (cell3.includes("label-danger"))  return "vencida";
  if (cell3.includes("label-warning")) return "bloqueada";
  return "ok";
}

function buildDataTablesParams(length = 5000): URLSearchParams {
  const p = new URLSearchParams({ draw: "1", start: "0", length: String(length), "search[value]": "", "search[regex]": "false" });
  for (let i = 0; i <= 6; i++) {
    p.append(`columns[${i}][data]`, String(i));
    p.append(`columns[${i}][searchable]`, "true");
    p.append(`columns[${i}][orderable]`, "false");
    p.append(`columns[${i}][search][value]`, "");
    p.append(`columns[${i}][search][regex]`, "false");
  }
  return p;
}

export function criarNowAdapter(
  creds: ServidorCredenciais,
  _id: number,
  onSaveSession: SaveSession,
  onSaveContas: SaveContaVencimento,
): PainelAdapter {
  // Sessão pode estar em cache no objeto — atualizada após auto-login
  let sessionCache = creds.session_cookie ?? "";

  async function getSession(): Promise<string> {
    const expirado = creds.session_expiry && new Date(creds.session_expiry) < new Date();
    if (sessionCache && !expirado) return sessionCache;

    // Auto-login via CapSolver
    const usuario = creds.painel_usuario ?? "";
    const senha   = creds.painel_senha   ?? "";
    if (!usuario || !senha) throw new Error("NOW: usuário/senha não configurados.");

    const novaSession = await loginNow(creds.painel_url ?? BASE_URL, usuario, senha);
    sessionCache = novaSession;
    const expiry = new Date(Date.now() + 23 * 60 * 60 * 1000); // 23h (margem)
    await onSaveSession(novaSession, expiry);
    return novaSession;
  }

  return {
    async listarContas(): Promise<ContaPainel[]> {
      const session = await getSession();
      const codrev  = getCodrev(creds.painel_url ?? "");
      const usuario = creds.painel_usuario ?? "";

      const res = await phpFetch(
        session, codrev,
        `usuario-status-processo.php?usuario=${usuario}&status=Todos&perfil=`,
        buildDataTablesParams()
      );
      if (!res.ok) throw new Error(`NOW listarContas → ${res.status}`);
      const json = await res.json();
      const rows: string[][] = json.data ?? [];

      return rows.map((row) => ({
        usuario:   parseUsername(row[0]),
        rotulo:    parseNome(row[1]),
        vencimento: parseVencimento(row[3]),
        status:    parseStatus(row[3]),
      })).filter((c) => c.usuario !== "");
    },

    async getCreditos(): Promise<number | null> {
      const session = await getSession();
      const codrev  = getCodrev(creds.painel_url ?? "");
      const res = await fetch(`${BASE_URL}/index.php?p=inicio`, {
        headers: { Cookie: cookieHeader(session, codrev) },
      });
      if (!res.ok) return null;
      const html = await res.text();
      const m = html.match(/(\d+)\s*créditos/);
      return m ? Number(m[1]) : null;
    },

    async renovar(usuario: string, meses = 1): Promise<ResultadoRenovacao> {
      const session = await getSession();
      const codrev  = getCodrev(creds.painel_url ?? "");

      const body = new URLSearchParams({ id: usuario, qtdMes: String(meses) });
      const res = await phpFetch(session, codrev, "EnviarRenovarUsuario.php", body);
      if (!res.ok) throw new Error(`NOW renovar → ${res.status}`);

      const listaRes = await phpFetch(
        session, codrev,
        `usuario-status-processo.php?usuario=${creds.painel_usuario}&status=Todos&perfil=`,
        buildDataTablesParams()
      );
      const lista = await listaRes.json();
      const rows: string[][] = lista.data ?? [];
      const row = rows.find((r) => parseUsername(r[0]) === usuario);
      const novoVenc = row ? parseVencimento(row[3]) ?? undefined : undefined;

      if (novoVenc) await onSaveContas(usuario, novoVenc);
      return { ok: true, novoVencimento: novoVenc };
    },
  };
}
