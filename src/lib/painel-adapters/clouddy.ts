// Clouddy (console.clouddy.online) — não tem painel de revenda (que o Jonas saiba): tudo é feito
// entrando na CONTA DO CLIENTE, com o e-mail (guardado em aplicativos.mac) e a senha (aplicativos.chave).
// Endpoints capturados com o Jonas navegando em 13/10/2026 — ver docs/memoria/reference_clouddy_console.md.
// Site de páginas (HTML + formulários), sessão no cookie PHPSESSID, login com Cloudflare Turnstile.
// A renovação é paga com cartão no próprio site (manual); aqui só se lê a validade depois.
import { avisarSaldoZerado, ehErroSaldoZerado } from "@/lib/aviso-saldo-captcha";

const BASE = "https://console.clouddy.online";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";

// ---------- Turnstile (CapSolver) ----------

type RespostaCapSolver = {
  errorId?: number; errorCode?: string; errorDescription?: string;
  taskId?: string; status?: string; solution?: { token: string };
};

async function resolverTurnstile(siteKey: string): Promise<string> {
  const apiKey = process.env.CAPSOLVER_API_KEY;
  if (!apiKey) throw new Error("CAPSOLVER_API_KEY não definida.");
  const criacao = (await fetch("https://api.capsolver.com/createTask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientKey: apiKey,
      task: { type: "AntiTurnstileTaskProxyLess", websiteURL: `${BASE}/user/auth/login`, websiteKey: siteKey },
    }),
  }).then((r) => r.json())) as RespostaCapSolver;
  if (criacao.errorId) {
    if (ehErroSaldoZerado(criacao)) void avisarSaldoZerado("capsolver");
    throw new Error(`CapSolver createTask: ${criacao.errorDescription ?? criacao.errorCode}`);
  }
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
      const result = (await fetch("https://api.capsolver.com/getTaskResult", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientKey: apiKey, taskId: criacao.taskId }),
    }).then((r) => r.json())) as RespostaCapSolver;
    if (result.status === "ready" && result.solution) return result.solution.token;
    if (result.errorId) throw new Error(`CapSolver getTaskResult: ${result.errorDescription ?? result.errorCode}`);
  }
  throw new Error("Clouddy: captcha não resolvido após 90 s.");
}

// ---------- Sessão ----------

function cookieDaResposta(res: Response, anterior?: string): string | undefined {
  const getSetCookie = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  const linhas = getSetCookie ? getSetCookie.call(res.headers) : [res.headers.get("set-cookie") ?? ""];
  for (const linha of linhas) {
    const m = linha.match(/PHPSESSID=[^;]+/);
    if (m) return m[0];
  }
  return anterior;
}

/** Login na conta do cliente. Gasta 1 captcha (CapSolver). Devolve o cookie de sessão. */
export async function loginClouddy(email: string, senha: string): Promise<string> {
  const pagina = await fetch(`${BASE}/user/auth/login`, { headers: { "user-agent": UA } });
  const html = await pagina.text();
  const cookie = cookieDaResposta(pagina);
  const siteKey = html.match(/data-sitekey="([^"]+)"/)?.[1];
  if (!cookie || !siteKey) throw new Error("Clouddy: página de login mudou (sem sessão ou sem captcha).");

  const token = await resolverTurnstile(siteKey);
  const corpo = new URLSearchParams({
    "form[email]": email,
    "form[password]": senha,
    "cf-turnstile-response": token,
    "g-recaptcha-response": token,
  });
  const res = await fetch(`${BASE}/user/auth/login`, {
    method: "POST",
    redirect: "manual",
    headers: { "user-agent": UA, cookie, "content-type": "application/x-www-form-urlencoded", referer: `${BASE}/user/auth/login` },
    body: corpo,
  });
  const destino = res.headers.get("location") ?? "";
  // Sucesso = 301 para /user/index; senha errada = volta a página de login (200)
  if (res.status >= 300 && res.status < 400 && !/auth\/login/.test(destino)) return cookieDaResposta(res, cookie)!;
  throw new Error("O Clouddy recusou o login. Confira o e-mail e a senha salvos no aplicativo do cliente.");
}

export class SessaoClouddyExpirada extends Error {}

async function getPagina(cookie: string, caminho: string): Promise<string> {
  const res = await fetch(`${BASE}${caminho}`, { redirect: "manual", headers: { "user-agent": UA, cookie } });
  if (res.status >= 300 && res.status < 400 && /auth\/login/.test(res.headers.get("location") ?? "")) throw new SessaoClouddyExpirada("sessão expirada");
  if (!res.ok) throw new Error(`Clouddy: ${caminho} respondeu ${res.status}.`);
  const html = await res.text();
  if (/name="form\[email\]"/.test(html) && /name="form\[password\]"/.test(html) && /auth\/login|cf-turnstile/.test(html)) {
    throw new SessaoClouddyExpirada("sessão expirada");
  }
  return html;
}

const semTags = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/**
 * Data do site → "yyyy-mm-dd". O idioma muda o formato: em português "09/10/2027 18:51:06 -0300", em inglês
 * (o que o servidor recebe sem preferência de idioma) "2027-10-09 18:51:06 -0300". Já vem no fuso de Brasília.
 */
function dataBr(texto: string | undefined | null): string | null {
  const br = texto?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return texto?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
}

// ---------- Leitura ----------

export type ResumoClouddy = {
  ativo: boolean;
  estado: string | null;
  tarifa: string | null;
  inicio: string | null;
  /** "Data final do serviço" (yyyy-mm-dd) = validade. */
  validade: string | null;
};

/** Mesa (/user/dashboard): estado do serviço, tarifa e datas. */
export async function lerResumo(cookie: string): Promise<ResumoClouddy> {
  const html = await getPagina(cookie, "/user/dashboard");
  // Itens do "Resumo": <li class="list-group-item ...">Rótulo <span class="badge ...">valor</span></li>
  const itens = new Map<string, string>();
  for (const m of html.matchAll(/<li[^>]*list-group-item[^>]*>([\s\S]*?)<\/li>/g)) {
    const span = m[1].match(/<span[^>]*>([\s\S]*?)<\/span>/);
    const rotulo = semTags(m[1].replace(/<span[\s\S]*<\/span>/, ""));
    if (span && rotulo) itens.set(rotulo.toLowerCase(), semTags(span[1]));
  }
  const pegar = (re: RegExp) => [...itens].find(([k]) => re.test(k))?.[1] ?? null;
  // Rótulos em português ou inglês (o idioma depende da sessão)
  const estado = pegar(/^estado|^state|^status/);
  const validade = dataBr(pegar(/data final|end service date|end date/));
  if (!validade && !estado) throw new Error("Clouddy: não achei o resumo da conta na página (o site pode ter mudado).");
  return {
    ativo: !!estado && /ativo|active/i.test(estado),
    estado,
    tarifa: pegar(/^tarifa|^tariff/),
    inicio: dataBr(pegar(/data de in[ií]cio|start service date|start date/)),
    validade,
  };
}

/** Dispositivos (/user/devices): a "Última atividade" mais recente entre os aparelhos (yyyy-mm-dd). */
export async function lerUltimaAtividade(cookie: string): Promise<string | null> {
  const html = await getPagina(cookie, "/user/devices");
  const datas: string[] = [];
  for (const linha of html.split(/<tr[\s>]/).slice(1)) {
    for (const td of linha.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)) {
      const d = dataBr(semTags(td[1]).match(/(\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}) \d{2}:\d{2}/)?.[0]);
      if (d) datas.push(d);
    }
  }
  return datas.sort().at(-1) ?? null;
}

// ---------- Listas (TV e VOD) ----------

/** Credenciais do link de lista, nos dois formatos: get.php?username=&password= ou xc://usuario:senha@servidor/. */
export function credenciaisDaLista(link: string): { servidor: string; usuario: string; senha: string } | null {
  const xc = link.match(/^xc:\/\/([^:]+):([^@]+)@([^/]+)/i);
  if (xc) return { usuario: decodeURIComponent(xc[1]), senha: decodeURIComponent(xc[2]), servidor: xc[3].toLowerCase() };
  try {
    const u = new URL(link);
    const usuario = u.searchParams.get("username");
    const senha = u.searchParams.get("password");
    return usuario && senha ? { usuario, senha, servidor: u.host.toLowerCase() } : null;
  } catch {
    return null;
  }
}

/**
 * Link no formato m3u padrão (o mesmo dos outros apps) a partir do que o Clouddy guarda (`xc://usuario:senha@servidor/`)
 * ou de um get.php. Porta 80 some do link. null = link que não dá pra entender.
 */
export function linkM3uPadrao(link: string): string | null {
  const c = credenciaisDaLista(link);
  if (!c) return null;
  const servidor = c.servidor.replace(/:80$/, "");
  return `http://${servidor}/get.php?username=${encodeURIComponent(c.usuario)}&password=${encodeURIComponent(c.senha)}&type=m3u_plus&output=ts`;
}

const mesmaLista = (a: string, b: string) => {
  const x = credenciaisDaLista(a), y = credenciaisDaLista(b);
  return !!x && !!y && x.usuario === y.usuario && x.senha === y.senha && x.servidor.replace(/:80$/, "") === y.servidor.replace(/:80$/, "");
};

export type TipoLista = "tv" | "vod";

/** Link salvo hoje na lista (TV ou VOD); null = sem lista. Contém usuário/senha IPTV: não logar. */
export async function lerLista(cookie: string, tipo: TipoLista): Promise<string | null> {
  const html = await getPagina(cookie, `/user/${tipo}-playlist/edit`);
  const valor = html.match(/name="form\[url\]"[^>]*value="([^"]*)"/)?.[1] ?? html.match(/value="([^"]*)"[^>]*name="form\[url\]"/)?.[1];
  return valor ? valor.replace(/&amp;/g, "&") : null;
}

async function postarLista(cookie: string, tipo: TipoLista, url: string): Promise<void> {
  const form = new FormData();
  form.append("form[m3u]", new Blob([], { type: "application/octet-stream" }), "");
  form.append("form[url]", url);
  if (tipo === "tv") form.append("form[epg]", "");
  const res = await fetch(`${BASE}/user/${tipo}-playlist/edit`, {
    method: "POST",
    redirect: "manual",
    headers: { "user-agent": UA, cookie, referer: `${BASE}/user/${tipo}-playlist/edit` },
    body: form,
  });
  if (res.status >= 400) throw new Error(`Clouddy: salvar a lista ${tipo.toUpperCase()} respondeu ${res.status}.`);
}

/**
 * Grava a lista em TV ou VOD e confere lendo de volta (o Clouddy reescreve para xc://...).
 * Tenta salvar por cima; se não pegar, faz como o site (apagar → salvar) e confere de novo.
 */
export async function salvarLista(cookie: string, tipo: TipoLista, url: string): Promise<void> {
  await postarLista(cookie, tipo, url);
  const lida = await lerLista(cookie, tipo);
  if (lida && mesmaLista(lida, url)) return;
  await getPagina(cookie, `/user/${tipo}-playlist/delete`).catch((e) => { if (e instanceof SessaoClouddyExpirada) throw e; });
  await postarLista(cookie, tipo, url);
  const depois = await lerLista(cookie, tipo);
  if (!depois || !mesmaLista(depois, url)) throw new Error(`O Clouddy não gravou a lista ${tipo.toUpperCase()}. Confira no site.`);
}

// ---------- Perfil: senha e PIN ----------

/** PIN da conta: 4 dígitos (o site vem com 0000). */
export const PIN_RE = /^\d{4}$/;

/**
 * Formulário do perfil (/user/profile/edit): senha, PIN e fuso vão juntos (capturado em 13/10/2026). Quem
 * não muda vai com o valor atual: senha = a salva no aplicativo; PIN e fuso = os que estão na página.
 */
async function salvarPerfil(cookie: string, dados: { senha: string; pin?: string }): Promise<void> {
  const html = await getPagina(cookie, "/user/profile/edit");
  const pinAtual = html.match(/name="form\[pin\]"[^>]*value="([^"]*)"/)?.[1] ?? html.match(/value="([^"]*)"[^>]*name="form\[pin\]"/)?.[1] ?? "0000";
  const fuso = html.match(/name="form\[timezone\]"[\s\S]*?<option[^>]*selected[^>]*value="([^"]+)"/)?.[1]
    ?? html.match(/name="form\[timezone\]"[\s\S]*?<option[^>]*value="([^"]+)"[^>]*selected/)?.[1]
    ?? "America/Sao_Paulo";
  const res = await fetch(`${BASE}/user/profile/edit`, {
    method: "POST",
    redirect: "manual",
    headers: { "user-agent": UA, cookie, "content-type": "application/x-www-form-urlencoded", referer: `${BASE}/user/profile/edit` },
    body: new URLSearchParams({ "form[password]": dados.senha, "form[pin]": dados.pin ?? pinAtual, "form[timezone]": fuso }),
  });
  if (res.status >= 400) throw new Error(`Clouddy: salvar o perfil respondeu ${res.status}.`);
}

/** PIN que está salvo na conta (lido da página do perfil). */
export async function lerPin(cookie: string): Promise<string | null> {
  const html = await getPagina(cookie, "/user/profile/edit");
  return html.match(/name="form\[pin\]"[^>]*value="([^"]*)"/)?.[1] ?? html.match(/value="([^"]*)"[^>]*name="form\[pin\]"/)?.[1] ?? null;
}

/** Troca a senha da conta (mantém PIN e fuso). */
export async function trocarSenha(cookie: string, novaSenha: string): Promise<void> {
  await salvarPerfil(cookie, { senha: novaSenha });
}

/** Troca o PIN e confere lendo de volta. `senhaAtual` vai junto (o formulário exige) e não muda. */
export async function trocarPin(cookie: string, senhaAtual: string, pin: string): Promise<void> {
  if (!PIN_RE.test(pin)) throw new Error("O PIN precisa ter 4 números.");
  await salvarPerfil(cookie, { senha: senhaAtual, pin });
  if ((await lerPin(cookie)) !== pin) throw new Error("O Clouddy não gravou o PIN novo. Confira no site.");
}
