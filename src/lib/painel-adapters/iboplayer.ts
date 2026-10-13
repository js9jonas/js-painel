// IBO Player (id_app 8) — tráfego capturado em 13/10/2026 com o Jonas navegando. Duas pontas:
//  - Revenda IBOSOL (ibosol.com, API backend-apis.ibosol.com): atende ~24 apps (IBO Player = app_id 1,
//    módulo "IBOPLAYER"). Login e-mail + senha + Cloudflare Turnstile (CapSolver), token opaco (Bearer).
//    Consulta (check-device-status), ativação (1 crédito = 1 ano), comentário e troca de endereço em massa.
//  - Site do cliente (tvplayeribo.com): login MAC + chave do aparelho + captcha de imagem próprio (SVG →
//    PNG → CapSolver ImageToText). Token JWT de 1 dia. Listas: ver, salvar (cria/edita), apagar.
// As listas cadastradas pelo cliente NÃO aparecem na revenda (check-device-status devolve só as da revenda).
import { avisarSaldoZerado, ehErroSaldoZerado } from "@/lib/aviso-saldo-captcha";
import type { ContaPainel, PainelAdapter, SaveSession, ServidorCredenciais } from "./types";

const API_REVENDA = "https://backend-apis.ibosol.com";
const SITE_CLIENTE = "https://tvplayeribo.com";
const TURNSTILE_SITEKEY = "0x4AAAAAACJ-DZrldbwqTtbg";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";

export const IBOSOL_APP_ID = 1;
export const IBOSOL_MODULO = "IBOPLAYER";

// ---------- CapSolver ----------

type RespostaCapSolver = {
  errorId?: number; errorCode?: string; errorDescription?: string;
  taskId?: string; status?: string; solution?: { token?: string; text?: string };
};

async function capsolver(task: Record<string, unknown>): Promise<NonNullable<RespostaCapSolver["solution"]>> {
  const apiKey = process.env.CAPSOLVER_API_KEY;
  if (!apiKey) throw new Error("CAPSOLVER_API_KEY não definida.");
  const criacao = (await fetch("https://api.capsolver.com/createTask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientKey: apiKey, task }),
  }).then((r) => r.json())) as RespostaCapSolver;
  if (criacao.errorId) {
    if (ehErroSaldoZerado(criacao)) void avisarSaldoZerado("capsolver");
    throw new Error(`CapSolver: ${criacao.errorDescription ?? criacao.errorCode}`);
  }
  if (criacao.status === "ready" && criacao.solution) return criacao.solution; // ImageToText responde na hora
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const r = (await fetch("https://api.capsolver.com/getTaskResult", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientKey: apiKey, taskId: criacao.taskId }),
    }).then((x) => x.json())) as RespostaCapSolver;
    if (r.status === "ready" && r.solution) return r.solution;
    if (r.errorId) throw new Error(`CapSolver: ${r.errorDescription ?? r.errorCode}`);
  }
  throw new Error("Captcha não resolvido após 90 s.");
}

// ---------- Revenda IBOSOL ----------

async function revenda<T>(metodo: string, path: string, token: string | null, corpo?: unknown): Promise<T> {
  const res = await fetch(`${API_REVENDA}${path}`, {
    method: metodo,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      Origin: "https://ibosol.com",
      Referer: "https://ibosol.com/",
      "User-Agent": UA,
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(60_000),
  });
  const data = (await res.json().catch(() => null)) as { status?: unknown; msg?: string; message?: string } | null;
  if (res.status === 401) throw new SessaoIbosolExpirada();
  if (!res.ok) throw new Error(`IBOSOL ${path}: ${data?.msg ?? data?.message ?? `HTTP ${res.status}`}`);
  return data as T;
}

export class SessaoIbosolExpirada extends Error {
  constructor() { super("IBOSOL: sessão expirada."); }
}

/** Login na revenda (1 Turnstile). O token não diz a validade: guardamos 12 h e relogamos no 401. */
export async function loginIbosol(email: string, senha: string): Promise<{ token: string; expiry: Date }> {
  const { token: captcha } = await capsolver({ type: "AntiTurnstileTaskProxyLess", websiteURL: "https://ibosol.com/login", websiteKey: TURNSTILE_SITEKEY });
  const r = await revenda<{ status?: boolean; token?: string; msg?: string; requires_2fa?: boolean }>("POST", "/api/login", null, {
    email, password: senha, captcha_token: captcha, device_token: "", remember: true,
  });
  if (r.requires_2fa) throw new Error("IBOSOL pediu verificação em 2 etapas: desative o 2FA da conta ou entre pelo site.");
  if (!r.status || !r.token) throw new Error(`IBOSOL: login recusado (${r.msg ?? "sem token"}).`);
  return { token: r.token, expiry: new Date(Date.now() + 12 * 60 * 60 * 1000) };
}

export async function creditosIbosol(token: string): Promise<number> {
  const r = await revenda<{ credit_point?: number }>("GET", "/api/get-resellers/credit-points", token);
  return Number(r.credit_point ?? 0);
}

export type IbosolDispositivo = {
  status: "active" | "expired" | string;
  mac: string;
  validade: string | null; // "YYYY-MM-DD"
  ultimoAcesso: string | null; // "YYYY-MM-DD"
  chave: string | null;
  appType: string | null;
  doRevendedor: boolean;
};

/** Situação do aparelho (qualquer aparelho do app, não só os ativados por você). null = não existe. */
export async function consultarIbosol(token: string, mac: string): Promise<IbosolDispositivo | null> {
  const r = await revenda<{
    status?: string; message?: string;
    device?: { mac_address?: string; expire_date?: string; last_seen?: string; device_key?: string; app_type?: string; activated_by?: string; reseller_email?: string };
  }>("POST", "/api/check-device-status", token, { macAddress: mac.trim().toLowerCase(), app_id: IBOSOL_APP_ID });
  if (!r.device || (r.status !== "active" && r.status !== "expired")) return null;
  const d = r.device;
  return {
    status: r.status,
    mac: d.mac_address ?? mac.toLowerCase(),
    validade: d.expire_date?.slice(0, 10) ?? null,
    ultimoAcesso: d.last_seen?.slice(0, 10) ?? null,
    // A revenda devolve a chave MASCARADA ("******"): não serve pra nada, vira null (13/10/2026)
    chave: d.device_key != null && !/^\*+$/.test(String(d.device_key)) ? String(d.device_key) : null,
    appType: d.app_type ?? null,
    doRevendedor: !!d.reseller_email,
  };
}

export type IbosolAtivado = { id: string; mac: string; validade: string | null; comentario: string | null; appType: string | null };

/** Aparelhos ativados pela revenda (só IBO Player). */
export async function listarAtivadosIbosol(token: string, keyword = ""): Promise<IbosolAtivado[]> {
  const todos: IbosolAtivado[] = [];
  for (let page = 1; page <= 50; page++) {
    const r = await revenda<{ data?: { data?: { id: string; module: string; mac_address: string; box_expiry_date?: string; comment?: string | null; app_type?: string }[]; last_page?: number } }>(
      "POST", "/api/activated-apps-list", token,
      { requestData: { moduleType: "all", pageNumber: page, pageSize: 100, keyword, search_type: "general", sort_key: "created_at", sort_type: "desc", start_date: null, end_date: null, expiry_filter: null } }
    );
    const itens = r.data?.data ?? [];
    for (const x of itens) {
      if (x.module !== IBOSOL_MODULO) continue;
      todos.push({ id: x.id, mac: x.mac_address, validade: x.box_expiry_date?.slice(0, 10) ?? null, comentario: x.comment ?? null, appType: x.app_type ?? null });
    }
    if (!itens.length || page >= (r.data?.last_page ?? 1)) break;
  }
  return todos;
}

/** Comentário do registro de ativação (nome do cliente). */
export async function comentarIbosol(token: string, idAtivacao: string, comentario: string | null): Promise<void> {
  const r = await revenda<{ status?: boolean; msg?: string }>("POST", "/api/update-comment", token, { id: idAtivacao, comment: comentario });
  if (!r.status) throw new Error(`IBOSOL: comentário não gravado (${r.msg ?? "recusado"}).`);
}

/** Ativa 1 ano (1 crédito) — o "Activate" da tela Check Mac. */
export async function ativarIbosol(token: string, mac: string, emailRevenda: string): Promise<string> {
  const r = await revenda<{ status?: boolean; msg?: string }>("POST", "/api/get-multi-app-activate", token, {
    module: { selectedModule: IBOSOL_MODULO },
    requestData: { is_trial: 3, macAddress: mac.trim().toLowerCase(), appType: "single-app", email: emailRevenda, creditPoints: 1, isConfirmed: true, app_id: IBOSOL_APP_ID },
  });
  if (!r.status) throw new Error(r.msg || "IBOSOL recusou a ativação.");
  return r.msg ?? "Ativado.";
}

/** Quantas listas (cadastradas pela revenda) usam o endereço. */
export async function contarDominioIbosol(token: string, antigo: string): Promise<number> {
  const r = await revenda<{ status?: boolean; matchedCount?: number; message?: string }>("POST", "/api/count-playlist-domain", token, {
    current_playlist_url: antigo, app_platform: IBOSOL_MODULO, app_id: IBOSOL_APP_ID,
  });
  if (!r.status) throw new Error(r.message || "IBOSOL não contou as listas.");
  return Number(r.matchedCount ?? 0);
}

/** Troca o endereço em todas as listas (da revenda) que usam o antigo. */
export async function mudarDominioIbosol(token: string, antigo: string, novo: string): Promise<string> {
  const corpo = { current_playlist_url: antigo, new_domain: novo, app_platform: IBOSOL_MODULO, app_id: IBOSOL_APP_ID, change_scope: "all", confirmed: true };
  const r = await revenda<{ status?: boolean; message?: string; needs_confirmation?: boolean; warnings?: string[] }>("POST", "/api/update-playlist", token, corpo);
  if (r.needs_confirmation) throw new Error(`IBOSOL pediu confirmação: ${(r.warnings ?? []).join(" ")}`);
  if (!r.status) throw new Error(r.message || "IBOSOL recusou a troca.");
  return r.message ?? "Endereço trocado.";
}

// ---------- Site do cliente (listas) ----------

async function cliente<T>(metodo: string, path: string, token: string | null, corpo?: unknown): Promise<T> {
  const res = await fetch(`${SITE_CLIENTE}${path}`, {
    method: metodo,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      Origin: SITE_CLIENTE,
      Referer: `${SITE_CLIENTE}/`,
      "User-Agent": UA,
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    signal: AbortSignal.timeout(60_000),
  });
  const data = (await res.json().catch(() => null)) as { status?: string; msg?: string; message?: string } | null;
  if (res.status === 429) throw new Error("O site do IBO Player limitou os logins (muitas tentativas). Tente mais tarde.");
  if (!res.ok) throw new Error(`IBO Player ${path}: ${data?.message ?? data?.msg ?? `HTTP ${res.status}`}`);
  return data as T;
}

/**
 * Prepara o SVG do captcha pra leitura: a tag <svg> repete atributos (height 2x, o conversor recusa), os
 * 2 caracteres (cinza, contornados) ficam sobre fundo preto e passam da borda de baixo do viewBox. Tira
 * width/height, estica o viewBox pra baixo, amplia 3× e troca o fundo por branco.
 */
function svgParaLeitura(svg: string): string {
  return svg
    .replace(/<svg\b[^>]*>/, (tag) => tag
      .replace(/\s(width|height)="[^"]*"/g, "")
      .replace(/viewBox="([\d.]+)[ ,]([\d.]+)[ ,]([\d.]+)[ ,]([\d.]+)"/, (_m, x, y, w, h) => `viewBox="${x},${y},${w},${Number(h) * 1.3}"`)
      .replace("<svg", '<svg width="450" height="195"'))
    .replace(/<rect([^>]*)fill="#000(000)?"/, '<rect$1fill="#fff"');
}

// O OCR do CapSolver erra essa fonte (leu "pipj" onde estava "BR", 13/10/2026): quem lê é o Claude.
const MODELO_CAPTCHA = "claude-haiku-4-5-20251001";

/** Captcha de imagem do login: SVG → PNG → leitura pelo Claude. */
async function resolverCaptchaCliente(): Promise<{ texto: string; token: string }> {
  const { svg, token } = await cliente<{ svg: string; token: string }>("GET", "/frontend/captcha/generate", null);
  const sharp = (await import("sharp")).default;
  const png = await sharp(Buffer.from(svgParaLeitura(svg))).flatten({ background: "#ffffff" }).png().toBuffer();
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const r = await new Anthropic().messages.create({
    model: MODELO_CAPTCHA,
    max_tokens: 20,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: png.toString("base64") } },
        { type: "text", text: "Imagem de captcha com letras e/ou números grandes (ignore a linha colorida que cruza). Responda SÓ os caracteres, sem espaços nem explicação." },
      ],
    }],
  });
  const bloco = r.content.find((c) => c.type === "text");
  const texto = (bloco && bloco.type === "text" ? bloco.text : "").replace(/[^0-9a-z]/gi, "").toUpperCase();
  return { texto, token };
}

export type SessaoClienteIboPlayer = { token: string; expira: number };

/** Login no site do cliente (MAC + chave). Tenta o captcha até 3 vezes (o OCR às vezes erra). */
export async function entrarClienteIboPlayer(mac: string, chave: string): Promise<SessaoClienteIboPlayer> {
  let ultimo = "";
  for (let i = 0; i < 3; i++) {
    const c = await resolverCaptchaCliente();
    try {
      const r = await cliente<{ status?: string; token?: string; message?: string }>("POST", "/frontend/device/login", null, {
        mac_address: mac.trim().toLowerCase(), device_key: chave.trim(), captcha: c.texto, token: c.token,
      });
      if (r.status === "success" && r.token) {
        const exp = JSON.parse(Buffer.from(r.token.split(".")[1], "base64url").toString()).exp as number | undefined;
        return { token: r.token, expira: exp ? exp * 1000 : Date.now() + 12 * 3600_000 };
      }
      ultimo = r.message ?? "login recusado";
    } catch (e: unknown) {
      ultimo = e instanceof Error ? e.message : "erro";
      if (/limitou/.test(ultimo)) throw e;
    }
    if (!/captcha/i.test(ultimo)) break; // chave/MAC errados: não adianta outro captcha
  }
  throw new Error(`O site do IBO Player não aceitou o login (${ultimo.replace(/^IBO Player [^:]+: /, "")}). Confira a chave do aparelho.`);
}

export type ListaIboPlayer = { id: string; nome: string; url: string; tipo: string; protegida: boolean };

export async function listasIboPlayer(s: SessaoClienteIboPlayer): Promise<ListaIboPlayer[]> {
  const r = await cliente<{ playlists?: { _id: string; playlist_name: string; url: string; playlist_type?: string; is_protected?: number }[] }>(
    "GET", "/frontend/device/playlists", s.token
  );
  return (r.playlists ?? []).map((p) => ({ id: p._id, nome: p.playlist_name, url: p.url, tipo: p.playlist_type ?? "general", protegida: !!p.is_protected }));
}

/** Cria (sem id) ou edita (com id) uma lista m3u (tipo "general"). Devolve a lista salva. */
export async function salvarListaIboPlayer(s: SessaoClienteIboPlayer, lista: { id?: string; nome: string; url: string }): Promise<ListaIboPlayer | null> {
  const r = await cliente<{ status?: string; msg?: string; data?: { _id: string; playlist_name: string; url: string; playlist_type?: string; is_protected?: number } }>(
    "POST", "/frontend/device/savePlaylist", s.token,
    { ...(lista.id ? { current_playlist_url_id: lista.id } : {}), playlist_url: lista.url, playlist_name: lista.nome, username: "", password: "", playlist_type: "general", protect: "false", xml_url: "", pin: "" }
  );
  if (r.status !== "success") throw new Error(`IBO Player: lista não salva (${r.msg ?? "recusado"}).`);
  const d = r.data;
  return d ? { id: d._id, nome: d.playlist_name, url: d.url, tipo: d.playlist_type ?? "general", protegida: !!d.is_protected } : null;
}

export async function apagarListaIboPlayer(s: SessaoClienteIboPlayer, id: string): Promise<void> {
  const r = await cliente<{ status?: string; msg?: string }>("DELETE", `/frontend/device/deletePlayListUrl/${id}`, s.token, { pin: "" });
  if (r.status !== "success") throw new Error(`IBO Player: lista não apagada (${r.msg ?? "recusado"}).`);
}

// ---------- Adapter de Conexões (card: conectado, aparelhos, créditos) ----------

export function criarIboPlayerAdapter(creds: ServidorCredenciais, _id: number, onSaveSession: SaveSession): PainelAdapter {
  let token = creds.session_cookie;
  let expira = creds.session_expiry ? new Date(creds.session_expiry).getTime() : 0;
  const sessao = async () => {
    if (token && expira - 60_000 > Date.now()) return token;
    if (!creds.painel_usuario || !creds.painel_senha) throw new Error("Painel IBO Player sem usuário/senha.");
    const r = await loginIbosol(creds.painel_usuario, creds.painel_senha);
    token = r.token;
    expira = r.expiry.getTime();
    await onSaveSession(r.token, r.expiry);
    return r.token;
  };
  return {
    async listarContas(): Promise<ContaPainel[]> {
      const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      return (await listarAtivadosIbosol(await sessao())).map((d) => ({
        usuario: d.mac, rotulo: d.comentario ?? "", vencimento: d.validade,
        status: d.validade && d.validade >= hoje ? "ok" : "vencida",
      }));
    },
    async getCreditos() {
      return creditosIbosol(await sessao());
    },
    async renovar() {
      return { ok: false, erro: "No IBO Player a renovação é por aparelho (Alertas → Renovar)." };
    },
  };
}
