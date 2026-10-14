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
import { montarLinkM3uSmartOne } from "@/lib/smartone-m3u";
import { avisarSaldoZerado, ehErroSaldoZerado } from "@/lib/aviso-saldo-captcha";
import { registrarRecusaToken, registrarUsoOkToken } from "@/lib/painel-sessao-log";

const BASE = "https://smartone-iptv.com";
const TURNSTILE_SITEKEY = "0x4AAAAAAAP8nNwILjC5_ux6";

export interface SmartOneDevice {
  id: number; // smartkey id (edit_playlist/{id}/)
  mac: string;
  model: string | null;
  activation_expired: string | null; // yyyy-mm-dd
  device_note?: { comment: string | null };
  /** "Date Fetched" do site: último dia em que a TV buscou a lista (yyyy-mm-dd). */
  lista_acessada_em?: string | null;
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
    if (ehErroSaldoZerado(criacao)) void avisarSaldoZerado("capsolver");
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
    registrarRecusaToken(cookie, path);
    throw new Error("SmartOne: sessão expirada.");
  }
  registrarUsoOkToken(cookie);
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

// Login compartilhado por e-mail: card, sync, listas e Alertas chamam loginSmartOne cada um por si,
// e pedidos em paralelo faziam vários logins seguidos (3 em 70 ms em 14/10/2026) — cada um gasta
// captcha e derruba a sessão do anterior. Em andamento ou feito há menos de 1 min → mesmo resultado.
const REUSO_LOGIN_MS = 60_000;
const loginsSmartOne = new Map<string, { p: Promise<{ token: string; expiry: Date }>; em: number }>();

export function loginSmartOne(email: string, senha: string): Promise<{ token: string; expiry: Date }> {
  const chave = email.trim().toLowerCase();
  const atual = loginsSmartOne.get(chave);
  if (atual && Date.now() - atual.em < REUSO_LOGIN_MS) return atual.p;
  const p = loginSmartOneDireto(email, senha);
  loginsSmartOne.set(chave, { p, em: Date.now() });
  // Falhou → não guarda (o próximo tenta de novo). O catch só evita unhandledRejection; quem chamou recebe o erro.
  p.catch(() => {
    if (loginsSmartOne.get(chave)?.p === p) loginsSmartOne.delete(chave);
  });
  return p;
}

async function loginSmartOneDireto(
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

const MESES: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** "Oct 13, 2026" → "2026-10-13" (montado à mão: o container roda em UTC). Outro formato → null. */
function parseDataCurta(texto: string): string | null {
  const m = texto.trim().match(/^([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),\s*(\d{4})$/);
  const mes = m ? MESES[m[1].toLowerCase()] : undefined;
  return m && mes ? `${m[3]}-${mes}-${m[2].padStart(2, "0")}` : null;
}

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
    const fetchedMatch = linha.match(/data-title="Date Fetched">([\s\S]*?)<\/td>/);

    dispositivos.push({
      id: parseInt(idMatch[1], 10),
      mac,
      model: modelMatch ? semTags(modelMatch[1]) || null : null,
      activation_expired: expMatch ? parseExpiracao(semTags(expMatch[1])) : null,
      device_note: { comment: noteMatch ? semTags(noteMatch[1]) || null : null },
      lista_acessada_em: fetchedMatch ? parseDataCurta(semTags(fetchedMatch[1])) : null,
    });
  }

  return dispositivos;
}

/**
 * Todos os aparelhos do painel: aba "active" + aba "pending". O SmartOne deixa o aparelho em "Pending"
 * até o cliente recarregar a lista na TV — inclusive depois de ativar por giftcode. Sem ler essa aba o
 * sync não via a validade nova (caso Joel Conceição, 13/10/2026: ativo até 17/10/2027 no painel,
 * js-painel parado na data antiga). MAC repetido (smartkey antigo + novo): fica o de validade maior.
 */
export async function getDispositivos(cookie: string): Promise<SmartOneDevice[]> {
  const porMac = new Map<string, SmartOneDevice>();
  for (const aba of ["active", "pending"]) {
    for (let page = 1; page <= 200; page++) {
      const html = await getHtml(
        `/plugin/smart_one/client_main/index/${aba}/${page}/?sort=id&order=desc`,
        cookie
      );
      const dispositivos = parseDispositivosPagina(html);
      if (dispositivos.length === 0) break;
      for (const d of dispositivos) {
        const mac = d.mac.toUpperCase();
        const atual = porMac.get(mac);
        if (!atual || (d.activation_expired ?? "") > (atual.activation_expired ?? "")) porMac.set(mac, d);
      }
    }
  }
  return [...porMac.values()];
}

/**
 * Linha do aparelho no painel pelo MAC: percorre a aba "active" (20 por página) e depois a "pending",
 * parando no primeiro encontrado (smartkey mais novo do MAC). null = MAC não está no painel.
 */
export async function buscarDispositivoPorMac(cookie: string, mac: string): Promise<SmartOneDevice | null> {
  const alvo = mac.trim().toUpperCase();
  for (const aba of ["active", "pending"]) {
    for (let page = 1; page <= 200; page++) {
      const html = await getHtml(`/plugin/smart_one/client_main/index/${aba}/${page}/?sort=id&order=desc`, cookie);
      const dispositivos = parseDispositivosPagina(html);
      if (dispositivos.length === 0) break;
      const achado = dispositivos.find((d) => d.mac.toUpperCase() === alvo);
      if (achado) return achado;
    }
  }
  return null;
}

export async function getPlaylistsDispositivo(
  cookie: string,
  deviceId: number
): Promise<SmartOnePlaylist[]> {
  const html = await getHtml(`/plugin/smart_one/client_main/edit_playlist/${deviceId}/`, cookie);

  const host = html.match(/name="server_host"\s+value="([^"]*)"/)?.[1] ?? "";
  const usuario = html.match(/name="server_username"\s+value="([^"]*)"/)?.[1] ?? "";
  const senha = html.match(/name="server_password"\s+value="([^"]*)"/)?.[1] ?? "";
  const nome = html.match(/name="server_name"\s+value="([^"]*)"/)?.[1] ?? "";

  if (!usuario) return [];

  // Formato de exibição/edição alinhado ao FunPlays/LazerPlay/CorePlayer (link m3u
  // único) — porta da página (`server_port`) ignorada de propósito, sempre 80.
  const url = montarLinkM3uSmartOne(host, usuario, senha);

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

// Cria um SMARTKEY NOVO pro MAC informado — diferente do appacesso (FunPlays/LazerPlay/
// CorePlayer), o SmartOne não tem "várias playlists num device": cada smartkey é o
// próprio device. "Adicionar playlist" aqui é o primeiro passo de ativar mais um device
// pro mesmo MAC/cliente; o novo registro nasce em status "Pending", não "Active".
export async function criarPlaylist(
  cookie: string,
  params: { mac: string; nome: string; host: string; port: string; usuario: string; senha: string; nota?: string }
): Promise<SmartOneDevice | null> {
  const path = `/plugin/smart_one/client_main/add_playlist/`;
  const pageHtml = await getHtml(path, cookie);
  const csrf = extrairCsrfToken(pageHtml);

  const xtreamPlaylist = `${params.host}:${params.port}/get.php?username=${encodeURIComponent(params.usuario)}&password=${encodeURIComponent(params.senha)}&type=m3u&output=ts`;

  const body = new URLSearchParams({
    _csrf_token: csrf,
    form_action: "generate_xtream_playlist",
    mac: params.mac,
    xtream_name: params.nome,
    xtream_playlist: xtreamPlaylist,
    note: params.nota ?? "",
  });

  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: body.toString(),
    redirect: "manual",
  });

  if (res.status !== 302) {
    throw new Error(`SmartOne: criação de playlist falhou (HTTP ${res.status}).`);
  }

  // A resposta não informa o id do smartkey criado — busca na listagem (ordenada por id
  // desc, o novo é o primeiro match desse MAC).
  const listHtml = await getHtml(`/plugin/smart_one/client_main/index/all/?sort=id&order=desc`, cookie);
  const dispositivos = parseDispositivosPagina(listHtml);
  return dispositivos.find((d) => d.mac.toUpperCase() === params.mac.toUpperCase()) ?? null;
}

export async function editarPlaylist(
  cookie: string,
  params: { id: number; mac: string; nome: string; host: string; port: string; usuario: string; senha: string; nota?: string }
): Promise<void> {
  const path = `/plugin/smart_one/client_main/edit_playlist/${params.id}/`;
  const pageHtml = await getHtml(path, cookie);
  const csrf = extrairCsrfToken(pageHtml);

  const body = new URLSearchParams({
    _csrf_token: csrf,
    mac: params.mac,
    server_name: params.nome,
    server_host: params.host,
    server_port: params.port,
    server_username: params.usuario,
    server_password: params.senha,
    note: params.nota ?? "",
  });

  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: body.toString(),
    redirect: "manual",
  });

  if (res.status !== 302) {
    throw new Error(`SmartOne: edição da playlist ${params.id} falhou (HTTP ${res.status}).`);
  }
}

export async function excluirPlaylist(cookie: string, id: number): Promise<void> {
  const res = await fetch(`${BASE}/plugin/smart_one/client_main/delete_smartkey/${id}/active/`, {
    headers: { cookie },
  });
  if (res.url.includes("/client/login")) {
    registrarRecusaToken(cookie, `delete_smartkey/${id}`);
    throw new Error("SmartOne: sessão expirada.");
  }
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

// ---------- Transferência de licença (12/10/2026) ----------
// A licença é a transação (client_transactions). Transferir MOVE a transação pro MAC novo e tira dela o
// link "Transfer": cada licença só transfere uma vez. Sem o link, o site recusa ("No available free slot
// for this license, or license already transferred"). O destino não soma dias: fica com a maior validade.

export interface SmartOneTransacao {
  id: number;
  mac: string;
  pago_em: string | null; // yyyy-mm-dd
  expira_em: string | null; // yyyy-mm-dd
  transferivel: boolean;
}

/** Token csrf da sessão (o mesmo em todas as páginas) — tirado de uma página leve (~1 s; a de transações leva ~12 s). */
export async function csrfDaSessao(cookie: string): Promise<string> {
  return extrairCsrfToken(await getHtml(`/plugin/smart_one/client_main/check/`, cookie));
}

/** Transações (licenças) do MAC — filtro do próprio site (POST com csrf). O site leva ~7 s por consulta. */
export async function transacoesDoMac(cookie: string, mac: string, csrf?: string): Promise<SmartOneTransacao[]> {
  csrf ??= await csrfDaSessao(cookie);
  const body = new URLSearchParams({ _csrf_token: csrf, "filters[mac]": mac, "filters[per_page]": "20", submit: "1" });
  const res = await fetch(`${BASE}/plugin/smart_one/client_transactions/index/all`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: body.toString(),
  });
  if (res.url.includes("/client/login")) {
    registrarRecusaToken(cookie, "client_transactions");
    throw new Error("SmartOne: sessão expirada.");
  }
  const html = await res.text();
  const corpo = html.slice(html.indexOf("<tbody"), html.indexOf("</tbody>"));
  const alvo = mac.trim().toUpperCase();
  const out: SmartOneTransacao[] = [];
  for (const tr of corpo.split(/<tr[^>]*>/).slice(1)) {
    const cel = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => semTags(m[1]));
    if (cel.length < 5 || cel[1].toUpperCase() !== alvo) continue;
    out.push({
      id: parseInt(cel[0], 10),
      mac: cel[1],
      pago_em: parseExpiracao(cel[3]),
      expira_em: parseExpiracao(cel[4]),
      transferivel: /client_transactions\/transfer\/\d+/.test(tr),
    });
  }
  return out;
}

/** Licença em vigor do MAC (a de maior vencimento) e se ainda pode ser transferida. null = sem licença. */
export async function licencaDoMac(cookie: string, mac: string, csrf?: string): Promise<SmartOneTransacao | null> {
  const lista = await transacoesDoMac(cookie, mac, csrf);
  return lista.sort((a, b) => (b.expira_em ?? "").localeCompare(a.expira_em ?? ""))[0] ?? null;
}

/** Transfere a licença de um MAC pra outro. `listas` = levar as playlists junto (padrão: não). */
export async function transferirLicenca(
  cookie: string,
  deMac: string,
  paraMac: string,
  listas = false
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const path = `/plugin/smart_one/client_transfer/license`;
  const csrf = extrairCsrfToken(await getHtml(path, cookie));
  const body = new URLSearchParams({ _csrf_token: csrf, from_mac: deMac, to_mac: paraMac, playlists: listas ? "1" : "0" });
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: body.toString(),
    redirect: "manual",
  });
  // Sucesso: 302 de volta pra página, que mostra "License Successfully transferred to : <MAC>".
  // Recusa: 200 com o alerta do motivo. Quem chama confere nas transações de qualquer jeito.
  const html = res.status === 302 ? await getHtml(path, cookie) : await res.text();
  const alertas = [...html.matchAll(/class="alert[^"]*"[^>]*>([\s\S]*?)<\/div>/g)]
    .map((m) => semTags(m[1]).replace(/^×\s*/, ""))
    .filter((t) => t && !/irreversible/i.test(t));
  const msg = alertas[0] ?? "";
  if (/successfully transferred/i.test(msg)) return { ok: true };
  return { ok: false, erro: msg || `sem confirmação do site (HTTP ${res.status})` };
}

/**
 * Mass Change hostname (capturado em 13/10/2026: bandeira5.info → pfun.store, "Successfully Updated on 20
 * playlists"). Troca só o endereço, SEM porta (a porta tem um "Mass change PORT" à parte). Devolve quantas listas.
 */
export async function mudarHostListas(cookie: string, antigo: string, novo: string): Promise<number> {
  const path = `/plugin/smart_one/client_main/hostname/`;
  const csrf = extrairCsrfToken(await getHtml(path, cookie));
  const body = new URLSearchParams({ _csrf_token: csrf, from_server_host: antigo, to_server_host: novo, server_type: "all" });
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    body: body.toString(),
    redirect: "manual",
  });
  const html = res.status === 302 ? await getHtml(path, cookie) : await res.text();
  const alertas = [...html.matchAll(/class="alert[^"]*"[^>]*>([\s\S]*?)<\/div>/g)]
    .map((m) => semTags(m[1]).replace(/^×\s*/, ""))
    .filter((t) => t && !/irreversible|mass change PORT/i.test(t));
  const msg = alertas[0] ?? "";
  const n = msg.match(/updated on (\d+) playlist/i);
  if (n) return Number(n[1]);
  throw new Error(`SmartOne: ${msg || `sem confirmação do site (HTTP ${res.status})`}`);
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
