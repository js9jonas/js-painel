// SmartOne IPTV Player (smartone-iptv.com) — plataforma Blesta, HTML scraping.
// Diferente do padrão appacesso.com (FunPlays/LazerPlay/CorePlayer): sem API JSON,
// login via cookie de sessão (blesta_sid) + captcha Cloudflare Turnstile (CapSolver),
// e renovação consome um "giftcode" (saldo = contador "Unused" em /client_codes/).
import type {
  ContaPainel,
  PainelAdapter,
  ResultadoRenovacao,
  ServidorCredenciais,
  SaveSession,
  SaveContaVencimento,
} from "./types";

const BASE = "https://smartone-iptv.com";
const TURNSTILE_SITEKEY = "0x4AAAAAAAP8nNwILjC5_ux6";

export interface SmartOneDevice {
  id: number; // smartkey id (edit_playlist/{id}/)
  mac: string;
  model: string | null;
  activation_expired: string | null; // yyyy-mm-dd
  device_note?: { comment: string | null };
}

export interface SmartOnePlaylist {
  id: number;
  name: string;
  url: string;
  is_selected: boolean;
  expired_date: string | null;
}

// ---------- Cloudflare Turnstile via CapSolver ----------

async function resolverTurnstile(websiteUrl: string, siteKey: string): Promise<string> {
  const apiKey = process.env.CAPSOLVER_API_KEY;
  if (!apiKey) throw new Error("CAPSOLVER_API_KEY não definida.");

  const criacao = (await fetch("https://api.capsolver.com/createTask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientKey: apiKey,
      task: { type: "AntiTurnstileTaskProxyLess", websiteURL: websiteUrl, websiteKey: siteKey },
    }),
  }).then((r) => r.json())) as any;

  if (criacao.errorId) {
    throw new Error(`CapSolver createTask: ${criacao.errorDescription ?? criacao.errorCode}`);
  }
  const { taskId } = criacao;

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const result = (await fetch("https://api.capsolver.com/getTaskResult", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientKey: apiKey, taskId }),
    }).then((r) => r.json())) as any;

    if (result.status === "ready") return result.solution.token as string;
    if (result.errorId) {
      throw new Error(`CapSolver getTaskResult: ${result.errorDescription ?? result.errorCode}`);
    }
  }

  throw new Error("SmartOne: Turnstile não resolvido após 90s.");
}

// ---------- HTML helpers ----------

function extrairCsrfToken(html: string): string {
  const m = html.match(/name="_csrf_token"\s+value="([^"]+)"/);
  if (!m) throw new Error("SmartOne: _csrf_token não encontrado na página.");
  return m[1];
}

function extrairCookieBlesta(res: Response, anterior?: string): string {
  const getSetCookie = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const linhas = getSetCookie ? getSetCookie.call(res.headers) : [res.headers.get("set-cookie") ?? ""];
  for (const linha of linhas) {
    const m = linha.match(/blesta_sid=[^;]+/);
    if (m) return m[0];
  }
  if (anterior) return anterior;
  throw new Error("SmartOne: cookie de sessão (blesta_sid) não encontrado.");
}

async function getHtml(path: string, cookie: string): Promise<string> {
  const res = await fetch(`${BASE}${path}`, { headers: { cookie } });
  if (res.url.includes("/client/login")) {
    throw new Error("SmartOne: sessão expirada.");
  }
  return res.text();
}

const ENTIDADES_HTML: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  aacute: "á", agrave: "à", acirc: "â", atilde: "ã",
  eacute: "é", egrave: "è", ecirc: "ê",
  iacute: "í", icirc: "î",
  oacute: "ó", ocirc: "ô", otilde: "õ", ograve: "ò",
  uacute: "ú", ucirc: "û", ugrave: "ù",
  ccedil: "ç", ntilde: "ñ",
  Aacute: "Á", Agrave: "À", Acirc: "Â", Atilde: "Ã",
  Eacute: "É", Ecirc: "Ê",
  Iacute: "Í",
  Oacute: "Ó", Otilde: "Õ",
  Uacute: "Ú",
  Ccedil: "Ç", Ntilde: "Ñ",
};

function decodificarEntidades(texto: string): string {
  return texto
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, nome) => ENTIDADES_HTML[nome] ?? m);
}

function semTags(texto: string): string {
  return decodificarEntidades(texto.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function parseExpiracao(texto: string): string | null {
  const trial = texto.match(/Trial,\s*Days Left\s*:\s*(\d+)/i);
  if (trial) {
    const dias = parseInt(trial[1], 10);
    return new Date(Date.now() + dias * 24 * 60 * 60 * 1000)
      .toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  }
  const data = new Date(texto.trim());
  if (!isNaN(data.getTime())) {
    return data.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  }
  return null;
}

function calcularStatus(activationExpired: string | null): ContaPainel["status"] {
  if (!activationExpired) return "bloqueada";
  return new Date(activationExpired) > new Date() ? "ok" : "vencida";
}

// ---------- Auth ----------

export async function loginSmartOne(
  email: string,
  senha: string
): Promise<{ token: string; expiry: Date }> {
  const pageRes = await fetch(`${BASE}/client/login/`, { redirect: "manual" });
  const html = await pageRes.text();
  const csrf = extrairCsrfToken(html);
  let cookie = extrairCookieBlesta(pageRes);

  const turnstileToken = await resolverTurnstile(`${BASE}/client/login/`, TURNSTILE_SITEKEY);

  const body = new URLSearchParams({
    _csrf_token: csrf,
    username: email,
    password: senha,
    "cf-turnstile-response": turnstileToken,
  });

  const loginRes = await fetch(`${BASE}/client/login/`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: body.toString(),
    redirect: "manual",
  });

  const location = loginRes.headers.get("location") ?? "";
  if (loginRes.status !== 302 || location.includes("login")) {
    throw new Error("SmartOne: login falhou (credenciais inválidas ou captcha rejeitado).");
  }

  cookie = extrairCookieBlesta(loginRes, cookie);
  // Sessão Blesta observada com vida curta (~13min) — relogar com margem.
  const expiry = new Date(Date.now() + 10 * 60 * 1000);
  return { token: cookie, expiry };
}

function sessaoValida(creds: ServidorCredenciais): boolean {
  return (
    !!creds.session_cookie &&
    !!creds.session_expiry &&
    new Date(creds.session_expiry).getTime() - 60_000 > Date.now()
  );
}

async function obterSessao(creds: ServidorCredenciais, onSaveSession: SaveSession): Promise<string> {
  if (sessaoValida(creds)) return creds.session_cookie!;
  const { token, expiry } = await loginSmartOne(creds.painel_usuario, creds.painel_senha);
  await onSaveSession(token, expiry);
  creds.session_cookie = token;
  creds.session_expiry = expiry;
  return token;
}

// ---------- Devices / Playlists ----------

function parseDispositivosPagina(html: string): SmartOneDevice[] {
  const dispositivos: SmartOneDevice[] = [];
  const linhas = html.split("<tr>").slice(1);

  for (const linha of linhas) {
    const idMatch = linha.match(/data-smartkey="(\d+)"/);
    const macMatch = linha.match(/data-title="Mac">([\s\S]*?)<\/td>/);
    if (!idMatch || !macMatch) continue;

    const mac = semTags(macMatch[1]);
    if (!mac) continue;

    const expMatch = linha.match(/data-title="Expiration">([\s\S]*?)<\/td>/);
    const modelMatch = linha.match(/data-title="Device">([\s\S]*?)<\/td>/);
    const noteMatch = linha.match(/data-title="Note">([\s\S]*?)<\/td>/);

    dispositivos.push({
      id: parseInt(idMatch[1], 10),
      mac,
      model: modelMatch ? semTags(modelMatch[1]) || null : null,
      activation_expired: expMatch ? parseExpiracao(semTags(expMatch[1])) : null,
      device_note: { comment: noteMatch ? semTags(noteMatch[1]) || null : null },
    });
  }

  return dispositivos;
}

export async function getDispositivos(cookie: string): Promise<SmartOneDevice[]> {
  const all: SmartOneDevice[] = [];
  for (let page = 1; page <= 200; page++) {
    const html = await getHtml(
      `/plugin/smart_one/client_main/index/active/${page}/?sort=id&order=desc`,
      cookie
    );
    const dispositivos = parseDispositivosPagina(html);
    if (dispositivos.length === 0) break;
    all.push(...dispositivos);
  }
  return all;
}

export async function getPlaylistsDispositivo(
  cookie: string,
  deviceId: number
): Promise<SmartOnePlaylist[]> {
  const html = await getHtml(`/plugin/smart_one/client_main/edit_playlist/${deviceId}/`, cookie);

  const host = html.match(/name="server_host"\s+value="([^"]*)"/)?.[1] ?? "";
  const port = html.match(/name="server_port"\s+value="([^"]*)"/)?.[1] ?? "";
  const usuario = html.match(/name="server_username"\s+value="([^"]*)"/)?.[1] ?? "";
  const senha = html.match(/name="server_password"\s+value="([^"]*)"/)?.[1] ?? "";
  const nome = html.match(/name="server_name"\s+value="([^"]*)"/)?.[1] ?? "";

  if (!usuario) return [];

  const url = `${host}:${port}/?username=${encodeURIComponent(usuario)}&password=${encodeURIComponent(senha)}`;

  return [
    {
      id: deviceId,
      name: nome || "",
      url,
      is_selected: true,
      expired_date: null,
    },
  ];
}

// ---------- Renovação via giftcode ----------

async function buscarGiftCodeLivre(cookie: string): Promise<string | null> {
  const html = await getHtml(`/plugin/smart_one/client_codes/index/unused/`, cookie);
  const m = html.match(/client_codes\/activate\/(\d+)\//);
  return m ? m[1] : null;
}

export async function ativarDispositivo(cookie: string, mac: string): Promise<string> {
  const code = await buscarGiftCodeLivre(cookie);
  if (!code) throw new Error("SmartOne: nenhum giftcode disponível (saldo \"Unused\" zerado).");

  const pageHtml = await getHtml(`/plugin/smart_one/client_codes/activate/${code}/`, cookie);
  const csrf = extrairCsrfToken(pageHtml);

  const body = new URLSearchParams({ _csrf_token: csrf, mac, code });
  const res = await fetch(`${BASE}/plugin/smart_one/client_codes/activate/${code}/`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: body.toString(),
    redirect: "manual",
  });

  if (res.status !== 302) {
    throw new Error(`SmartOne: ativação do MAC ${mac} falhou (giftcode ${code}).`);
  }

  return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    .toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

export async function getCreditosDisponiveis(cookie: string): Promise<number | null> {
  const html = await getHtml(`/plugin/smart_one/client_codes/`, cookie);
  const m = html.match(/Unused\s*<span class="badge">(\d+)<\/span>/);
  return m ? parseInt(m[1], 10) : null;
}

// ---------- PainelAdapter factory ----------

export function criarSmartOneAdapter(
  creds: ServidorCredenciais,
  _id: number,
  onSaveSession: SaveSession,
  _onSaveContas: SaveContaVencimento
): PainelAdapter {
  async function sessao(): Promise<string> {
    return obterSessao(creds, onSaveSession);
  }

  return {
    async listarContas(): Promise<ContaPainel[]> {
      const cookie = await sessao();
      const devices = await getDispositivos(cookie);
      return devices.map((d) => ({
        usuario: d.mac,
        rotulo: d.device_note?.comment ?? d.model ?? "",
        vencimento: d.activation_expired,
        status: calcularStatus(d.activation_expired),
      }));
    },

    async renovar(mac: string): Promise<ResultadoRenovacao> {
      try {
        const cookie = await sessao();
        const novoVencimento = await ativarDispositivo(cookie, mac);
        return { ok: true, novoVencimento };
      } catch (e: any) {
        return { ok: false, erro: e.message };
      }
    },

    async getCreditos(): Promise<number | null> {
      try {
        const cookie = await sessao();
        return await getCreditosDisponiveis(cookie);
      } catch {
        return null;
      }
    },
  };
}
