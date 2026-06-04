import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { Impit } from "impit";
import { impitFetch } from "./proxy-retry";
import type { ContaPainel, PainelAdapter, ResultadoRenovacao, ServidorCredenciais, SaveSession, SaveContaVencimento } from "./types";

// UNITV (ResellerSystem) — https://panel-web.revenda.watch/
// Auth: dealer_token retornado no login. Re-login automático via CapSolver (ImageToTextTask) quando returnCode=300.
// Criptografia AES-128-CBC em todos os request/response bodies.

const API_BASE    = "https://panel-web.revenda.watch/api";
const DOMAIN      = "https://panel-web.revenda.watch";
const DEALER_NAME = "jonas55";
const DEVICE_CODE = "js-painel-server-unitv-001";
const DEVICE_NAME = "Linux_x86_64";

const AES_KEY = Buffer.from("93403d3aa2ec48b4", "utf8");
const AES_IV  = Buffer.from("7cf0127d190cb909", "utf8");

// proxyUrl residencial bypassa bloqueio de IP do datacenter no Cloudflare
const impit = new Impit({ browser: "chrome", proxyUrl: process.env.UNIPLAY_PROXY_URL });

interface UnitvSession { token: string }

function parseSession(cookie: string | null): UnitvSession | null {
  if (!cookie) return null;
  try {
    const s = JSON.parse(cookie);
    if (s.token) return { token: s.token };
    return null;
  } catch { return null; }
}

function aesEncrypt(plaintext: string): string {
  const cipher = createCipheriv("aes-128-cbc", AES_KEY, AES_IV);
  return (cipher.update(plaintext, "utf8", "hex") + cipher.final("hex")).toUpperCase();
}

function aesDecrypt(hex: string): string {
  const decipher = createDecipheriv("aes-128-cbc", AES_KEY, AES_IV);
  return decipher.update(hex, "hex", "utf8") + decipher.final("utf8");
}

function md5(...parts: string[]): string {
  return createHash("md5").update(parts.join("")).digest("hex");
}

const BASE_HEADERS = {
  "content-type": "application/json;charset=UTF-8",
  "version": "1.0.2",
  "content": "h5_dealer",
  "Origin": DOMAIN,
  "Referer": `${DOMAIN}/`,
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

async function apiCall(token: string, action: string, bodyObj: object): Promise<any> {
  const encrypted = aesEncrypt(JSON.stringify(bodyObj));
  const res = await impitFetch(impit, `${API_BASE}/${action}`, {
    method: "POST",
    headers: { ...BASE_HEADERS, authorization: token, token },
    body: encrypted,
  });
  if (!res.ok) throw new Error(`UNITV HTTP ${res.status}`);
  const json = await res.json() as any;
  if (json.returnCode === 300) throw new UnitvSessionExpiredError();
  if (json.returnCode !== 0) throw new Error(`UNITV ${action} returnCode ${json.returnCode}: ${json.errorMessage}`);
  if (!json.data) throw new Error(`UNITV ${action}: resposta sem data`);
  return JSON.parse(aesDecrypt(json.data));
}

class UnitvSessionExpiredError extends Error {
  constructor() { super("UNITV: sessão expirada (returnCode 300)"); }
}

async function resolverCaptcha(imageB64: string): Promise<string> {
  const apiKey = process.env.CAPSOLVER_API_KEY;
  if (!apiKey) throw new Error("CAPSOLVER_API_KEY não definida.");

  const created = await fetch("https://api.capsolver.com/createTask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientKey: apiKey,
      task: { type: "ImageToTextTask", body: imageB64 },
    }),
  }).then(r => r.json()) as any;

  if (created.errorId) throw new Error(`CapSolver erro: ${created.errorDescription}`);

  // ImageToTextTask é resolvido de forma síncrona — resultado já vem no createTask
  if (created.status === "ready") return created.solution.text as string;

  // Fallback: polling para tarefas assíncronas
  const { taskId } = created;
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const result = await fetch("https://api.capsolver.com/getTaskResult", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientKey: apiKey, taskId }),
    }).then(r => r.json()) as any;
    if (result.status === "ready")  return result.solution.text as string;
    if (result.status === "failed") throw new Error(`CapSolver falhou: ${result.errorDescription}`);
  }
  throw new Error("CapSolver timeout após 20s.");
}

async function loginUnitv(usuario: string, senha: string): Promise<string> {
  // 1. Busca captcha — validate-code vem no header da resposta
  const randHex = randomBytes(16).toString("hex").toUpperCase();
  const captchaUrl = `${API_BASE}/validateCodeServlet?unixTime=${Date.now()}&0=${randHex}`;
  const captchaRes = await impitFetch(impit, captchaUrl, { headers: BASE_HEADERS });
  if (!captchaRes.ok) throw new Error(`UNITV: falha ao buscar captcha (${captchaRes.status})`);

  const validateKey = captchaRes.headers.get("validate-code");
  if (!validateKey) throw new Error("UNITV: header validate-code ausente na resposta do captcha.");

  const imageBytes = await captchaRes.arrayBuffer();
  const imageB64 = Buffer.from(imageBytes).toString("base64");

  // 2. Resolve captcha via CapSolver
  const validateCode = await resolverCaptcha(imageB64);

  // 3. Login
  const loginBody = {
    type: 0,
    username: usuario,
    password: senha,
    validateCode: validateCode.trim(),
    validateKey,
    domain: DOMAIN,
    device_code: DEVICE_CODE,
    device_name: DEVICE_NAME,
    details: {
      isPrivate: false,
      browserName: "Chrome",
      platform: DEVICE_NAME,
      screenResolution: "1920x1080",
      colorDepth: 24,
      deviceMemory: 8,
      hardwareConcurrency: 4,
      maxTouchPoints: 0,
    },
  };

  const encrypted = aesEncrypt(JSON.stringify(loginBody));
  const res = await impitFetch(impit, `${API_BASE}/login/saveLogin`, {
    method: "POST",
    headers: BASE_HEADERS,
    body: encrypted,
  });
  if (!res.ok) throw new Error(`UNITV login HTTP ${res.status}`);
  const json = await res.json() as any;
  if (json.returnCode !== 0) throw new Error(`UNITV login falhou (${json.returnCode}): ${json.errorMessage}`);

  const data = JSON.parse(aesDecrypt(json.data));
  if (!data.dealer_token) throw new Error("UNITV login: dealer_token ausente na resposta.");
  return data.dealer_token as string;
}

export function criarUnitvAdapter(
  creds: ServidorCredenciais,
  _id: number,
  onSaveSession: SaveSession,
  onSaveContas: SaveContaVencimento,
): PainelAdapter {
  let session = parseSession(creds.session_cookie);
  const usuario = creds.painel_usuario ?? DEALER_NAME;
  const senha   = creds.painel_senha ?? "";

  async function ensureToken(): Promise<string> {
    if (!session?.token) {
      const token = await loginUnitv(usuario, senha);
      session = { token };
      await onSaveSession(JSON.stringify(session));
    }
    return session.token;
  }

  async function callWithRelogin(action: string, bodyFn: (token: string) => object): Promise<any> {
    let token = await ensureToken();
    try {
      return await apiCall(token, action, bodyFn(token));
    } catch (err) {
      if (!(err instanceof UnitvSessionExpiredError)) throw err;
      // Re-login automático
      token = await loginUnitv(usuario, senha);
      session = { token };
      await onSaveSession(JSON.stringify(session));
      return await apiCall(token, action, bodyFn(token));
    }
  }

  return {
    async listarContas(): Promise<ContaPainel[]> {
      const data = await callWithRelogin("account", (token) => ({
        package_id: 1,
        dealer_token: token,
        dealer_name: usuario,
        time_zone: "America/Sao_Paulo",
        page: 1,
        pageSize: 500,
      }));
      const list: any[] = data.list ?? [];
      return list.map((u) => ({
        usuario: u.sn,
        rotulo: u.snName || "",
        vencimento: u.expireTime ? u.expireTime.slice(0, 10) : null,
        status: u.days <= 0 ? "vencida" : u.status === 0 ? "bloqueada" : "ok",
      }));
    },

    async getCreditos(): Promise<number> {
      const token = await ensureToken();
      const data = await callWithRelogin("getDealerInfo", () => ({
        dealer_token: token,
        dealer_name: usuario,
      }));
      return Number(data.dealerInfo?.points ?? 0);
    },

    async renovar(usuario: string, meses = 1): Promise<ResultadoRenovacao> {
      // Busca id interno
      const listData = await callWithRelogin("account", (token) => ({
        package_id: 1,
        dealer_token: token,
        dealer_name: DEALER_NAME,
        time_zone: "America/Sao_Paulo",
        page: 1,
        pageSize: 500,
      }));
      const conta = (listData.list ?? []).find((u: any) => u.sn === usuario);
      if (!conta) throw new Error(`UNITV: usuário "${usuario}" não encontrado`);

      const sign = md5("dealer", conta.id, "1", String(meses));
      await callWithRelogin("account/renew", (token) => ({
        sn: conta.sn,
        id: conta.id,
        package_id: 1,
        points_type: 1,
        auth_cycle: 1,
        pre_auth_id: 123,
        points: meses,
        sign,
        dealer_token: token,
        dealer_name: DEALER_NAME,
      }));

      // Busca novo vencimento
      const updatedData = await callWithRelogin("account", (token) => ({
        package_id: 1,
        dealer_token: token,
        dealer_name: DEALER_NAME,
        time_zone: "America/Sao_Paulo",
        page: 1,
        pageSize: 500,
      }));
      const updated = (updatedData.list ?? []).find((u: any) => u.sn === usuario);
      const novoVenc = updated?.expireTime ? updated.expireTime.slice(0, 10) : undefined;
      if (novoVenc) await onSaveContas(usuario, novoVenc);
      return { ok: true, novoVencimento: novoVenc };
    },
  };
}
