import type { ContaPainel, PainelAdapter, ResultadoRenovacao, ResultadoEdicao, ResultadoTeste, ServidorCredenciais, SaveSession, SaveContaVencimento } from "./types";

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

// col[2] vem como "usuario<br>senha" — pega a parte depois do <br>
function parseSenha(cell2: string): string | null {
  const partes = cell2.split(/<br\s*\/?>/i);
  return partes[1] ? semTags(partes[1]) || null : null;
}

function semTags(texto: string): string {
  return texto.replace(/<[^>]+>/g, "").trim();
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

// Gera credencial aleatória: lowercase + dígitos, 9 chars, ao menos 1 letra + 1 número
function gerarCredencialNow(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz123456789";
  let s = "";
  for (let i = 0; i < 9; i++) s += chars[Math.floor(Math.random() * chars.length)];
  if (!/[a-z]/.test(s)) s = "a" + s.slice(1);
  if (!/[0-9]/.test(s)) s = s.slice(0, -1) + "1";
  return s;
}

function parseModalValor(html: string, id: string): string {
  const m = html.match(new RegExp(`id="${id}"[^>]+value="([^"]*)"`, "i"))
         ?? html.match(new RegExp(`name="${id}"[^>]+value="([^"]*)"`, "i"));
  return m ? m[1] : "";
}

function parseModalPerfil(html: string): string {
  const m = html.match(/value="(\[(?:COM|SEM)-ADULTO\])"[^>]+checked/i);
  return m ? m[1] : "[SEM-ADULTO]";
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

class NowSessionExpiredError extends Error {}

// Verifica se a resposta é HTML de login (sessão PHP expirada no servidor)
function assertJson(res: Response, text: string): void {
  if (text.trimStart().startsWith("<")) throw new NowSessionExpiredError();
}

export function criarNowAdapter(
  creds: ServidorCredenciais,
  _id: number,
  onSaveSession: SaveSession,
  onSaveContas: SaveContaVencimento,
): PainelAdapter {
  let sessionCache = creds.session_cookie ?? "";

  const usuario = creds.painel_usuario ?? "";
  const senha   = creds.painel_senha   ?? "";
  const painelUrl = creds.painel_url ?? BASE_URL;

  async function doLogin(): Promise<string> {
    if (!usuario || !senha) throw new Error("NOW: usuário/senha não configurados.");
    const nova = await loginNow(painelUrl, usuario, senha);
    sessionCache = nova;
    await onSaveSession(nova, new Date(Date.now() + 23 * 60 * 60 * 1000));
    return nova;
  }

  async function getSession(): Promise<string> {
    const expirado = creds.session_expiry && new Date(creds.session_expiry) < new Date();
    if (sessionCache && !expirado) return sessionCache;
    return doLogin();
  }

  async function withRelogin<T>(fn: (session: string) => Promise<T>): Promise<T> {
    const session = await getSession();
    try {
      return await fn(session);
    } catch (err) {
      if (!(err instanceof NowSessionExpiredError)) throw err;
      // Sessão PHP expirou no servidor — força re-login via CapSolver
      const nova = await doLogin();
      return fn(nova);
    }
  }

  return {
    async listarContas(): Promise<ContaPainel[]> {
      return withRelogin(async (session) => {
        const codrev = getCodrev(painelUrl);
        const res = await phpFetch(
          session, codrev,
          `usuario-status-processo.php?usuario=${usuario}&status=Todos&perfil=`,
          buildDataTablesParams()
        );
        if (!res.ok) throw new Error(`NOW listarContas → ${res.status}`);
        const text = await res.text();
        assertJson(res, text);
        const json = JSON.parse(text);
        const rows: string[][] = json.data ?? [];
        return rows.map((row) => ({
          usuario:    parseUsername(row[0]),
          rotulo:     parseNome(row[1]),
          vencimento: parseVencimento(row[3]),
          status:     parseStatus(row[3]),
          senha:      parseSenha(row[2]),
        })).filter((c) => c.usuario !== "");
      });
    },

    async getCreditos(): Promise<number | null> {
      try {
        return await withRelogin(async (session) => {
          const codrev = getCodrev(painelUrl);
          const res = await fetch(`${BASE_URL}/index.php?p=inicio`, {
            headers: { Cookie: cookieHeader(session, codrev) },
          });
          if (!res.ok) return null;
          const html = await res.text();
          if (html.trimStart().startsWith("<script")) throw new NowSessionExpiredError();
          const m = html.match(/(\d+)\s*créditos/);
          return m ? Number(m[1]) : null;
        });
      } catch { return null; }
    },

    async editarConta(usuarioId: string, campos: { novaSenha?: string; novoRotulo?: string }): Promise<ResultadoEdicao> {
      return withRelogin(async (session) => {
        const codrev = getCodrev(painelUrl);

        // Busca dados atuais via modal de edição
        const modalRes = await phpFetch(session, codrev, "ScriptModalUserEditar.php",
          new URLSearchParams({ usuario: usuarioId })
        );
        if (!modalRes.ok) throw new Error(`NOW ScriptModalUserEditar → ${modalRes.status}`);
        const modalHtml = await modalRes.text();
        if (!modalHtml.includes("EditarNome")) throw new NowSessionExpiredError();

        const nome  = campos.novoRotulo ?? parseModalValor(modalHtml, "EditarNome");
        const senha = campos.novaSenha  ?? parseModalValor(modalHtml, "EditarSenha");
        const perfil = parseModalPerfil(modalHtml);

        const body = new URLSearchParams({
          EditarPorEmail: "N",
          EditarPorSMS:   "N",
          EditarNome:     nome,
          EditarSenha:    senha,
          EditarEmail:    "",
          EditarCelular:  "",
          ValorCobrado:   "",
          obs:            "",
          Usuario:        usuarioId,
        });
        body.append("EditarPerfil[]", perfil);

        const res = await phpFetch(session, codrev, "EnviarEditarUser.php", body);
        if (!res.ok) throw new Error(`NOW editarConta → ${res.status}`);
        const text = await res.text();
        if (!text.includes("LimparScript")) throw new NowSessionExpiredError();
        if (!text.toLowerCase().includes("sucesso")) {
          // Extrai mensagem de erro do HTML se houver
          const match = text.match(/<p[^>]*>([^<]{5,200})<\/p>/i);
          throw new Error(match ? match[1].trim() : "NOW: painel recusou a alteração.");
        }
        return { ok: true };
      });
    },

    async gerarTeste({ comAdultos = false, rotulo = "" } = {}): Promise<ResultadoTeste> {
      return withRelogin(async (session) => {
        const codrev     = getCodrev(painelUrl);
        const novoUser   = gerarCredencialNow();
        const novaSenha  = gerarCredencialNow();
        const perfil     = comAdultos ? "[COM-ADULTO]" : "[SEM-ADULTO]";

        const body = new URLSearchParams({
          EditarPorEmail: "N",
          EditarPorSMS:   "N",
          EditarNome:     rotulo,
          EditarUsuario:  novoUser,
          EditarSenha:    novaSenha,
          EditarEmail:    "",
          EditarCelular:  "",
          obs:            "",
        });
        body.append("EditarPerfil[]", perfil);

        const res = await phpFetch(session, codrev, "EnviarAdicionarTeste.php", body);
        if (!res.ok) throw new Error(`NOW gerarTeste → ${res.status}`);
        const text = await res.text();
        if (!text.includes("LimparScript")) throw new NowSessionExpiredError();
        if (!text.toLowerCase().includes("sucesso")) throw new Error("NOW gerarTeste: falhou.");

        // Busca vencimento do teste recém-criado
        let expiracao: string | undefined;
        let expiracaoHorario: string | undefined;
        try {
          const listaRes = await phpFetch(
            session, codrev,
            `teste-status-processo.php?usuario=${usuario}&status=&perfil=`,
            buildDataTablesParams()
          );
          if (listaRes.ok) {
            const listaText = await listaRes.text();
            const lista = JSON.parse(listaText);
            const rows: string[][] = lista.data ?? [];
            const row = rows.find((r) => parseUsername(r[0]) === novoUser);
            if (row) {
              expiracao = parseVencimento(row[3]) ?? undefined;
              // Best-effort: célula pode trazer hora junto da data (ex: "14/07/2026 21:30")
              const horarioMatch = row[3].match(/(\d{2}):(\d{2})/);
              expiracaoHorario = horarioMatch ? `${horarioMatch[1]}:${horarioMatch[2]}` : undefined;
            }
          }
        } catch { /* segue sem expiracao */ }

        return { ok: true, usuario: novoUser, senha: novaSenha, expiracao, expiracaoHorario };
      });
    },

    async renovar(usuario: string, meses = 1): Promise<ResultadoRenovacao> {
      return withRelogin(async (session) => {
        const codrev = getCodrev(painelUrl);

        const res = await phpFetch(session, codrev, "EnviarRenovarUsuario.php",
          new URLSearchParams({ id: usuario, qtdMes: String(meses) })
        );
        if (!res.ok) throw new Error(`NOW renovar → ${res.status}`);
        const resText = await res.text();
        assertJson(res, resText);

        const listaRes = await phpFetch(
          session, codrev,
          `usuario-status-processo.php?usuario=${creds.painel_usuario}&status=Todos&perfil=`,
          buildDataTablesParams()
        );
        const listaText = await listaRes.text();
        assertJson(listaRes, listaText);
        const lista = JSON.parse(listaText);
        const rows: string[][] = lista.data ?? [];
        const row = rows.find((r) => parseUsername(r[0]) === usuario);
        const novoVenc = row ? parseVencimento(row[3]) ?? undefined : undefined;

        if (novoVenc) await onSaveContas(usuario, novoVenc);
        return { ok: true, novoVencimento: novoVenc };
      });
    },
  };
}
