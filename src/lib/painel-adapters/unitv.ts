import { createCipheriv, createDecipheriv, createHash } from "crypto";
import { execFile } from "child_process";
import { promisify } from "util";
import { pool } from "@/lib/db";
import type { ContaPainel, PainelAdapter, ResultadoRenovacao, ServidorCredenciais } from "./types";

// UNITV (ResellerSystem) — https://panel-web.starhome.vip/
// Cloudflare WAF: requer TLS impersonation Chrome120 via curl_cffi (Python).
// Sessão: { token (dealer, permanente), cfClearance (expira ~1 ano) }
// Refresh: POST /api/servidores/5/refresh-session { token, cfClearance }

const execFileAsync = promisify(execFile);

const AES_KEY = Buffer.from("93403d3aa2ec48b4", "utf8");
const AES_IV  = Buffer.from("7cf0127d190cb909", "utf8");
const DEALER_NAME = "jonas55";
const PYTHON_SCRIPT = "src/scripts/unitv_request.py";

interface UnitvSession {
  token: string;
  cfClearance: string;
}

function parseSession(cookie: string | null): UnitvSession | null {
  if (!cookie) return null;
  try {
    const s = JSON.parse(cookie);
    if (s.token && s.cfClearance) return s;
    return null;
  } catch {
    return null;
  }
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

async function callUnitvApi(session: UnitvSession, action: string, bodyObj: object): Promise<any> {
  const body = aesEncrypt(JSON.stringify(bodyObj));
  const input = JSON.stringify({ token: session.token, cfClearance: session.cfClearance, action, body });

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync("python3", [PYTHON_SCRIPT], { input, timeout: 35_000 }));
  } catch (err: any) {
    throw new Error(`UNITV python3 falhou: ${err.stderr ?? err.message}`);
  }

  const result = JSON.parse(stdout.trim());
  if (!result.ok) throw new Error(`UNITV ${action}: ${result.error}`);
  if (!result.data) throw new Error(`UNITV ${action}: resposta sem data`);

  return JSON.parse(aesDecrypt(result.data));
}

export function criarUnitvAdapter(creds: ServidorCredenciais, idServidor: number): PainelAdapter {
  const session = parseSession(creds.session_cookie);

  if (!session) {
    const msg = "UNITV: sessão não configurada. Use POST /api/servidores/5/refresh-session { token, cfClearance }";
    return {
      async listarContas() { throw new Error(msg); },
      async renovar() { throw new Error(msg); return { ok: false, erro: msg }; },
    };
  }

  return {
    async listarContas(): Promise<ContaPainel[]> {
      const data = await callUnitvApi(session, "account", {
        package_id: 1,
        dealer_token: session.token,
        dealer_name: DEALER_NAME,
        time_zone: "America/Sao_Paulo",
        page: 1,
        pageSize: 500,
      });

      const list: any[] = data.list ?? [];
      return list.map((u) => ({
        usuario: u.sn,
        rotulo: u.snName || "",
        vencimento: u.expireTime ? u.expireTime.slice(0, 10) : null,
        status: u.days <= 0 ? "vencida" : u.status === 0 ? "bloqueada" : "ok",
      }));
    },

    async renovar(usuario: string, meses = 1): Promise<ResultadoRenovacao> {
      // Buscar id interno do usuário
      const listData = await callUnitvApi(session, "account", {
        package_id: 1,
        dealer_token: session.token,
        dealer_name: DEALER_NAME,
        time_zone: "America/Sao_Paulo",
        page: 1,
        pageSize: 500,
      });

      const conta = (listData.list ?? []).find((u: any) => u.sn === usuario);
      if (!conta) throw new Error(`UNITV: usuário "${usuario}" não encontrado`);

      const sign = md5("dealer", conta.id, "1", String(meses));
      await callUnitvApi(session, "account/renew", {
        sn: conta.sn,
        id: conta.id,
        package_id: 1,
        points_type: 1,
        auth_cycle: 1,
        pre_auth_id: 123,
        points: meses,
        sign,
        dealer_token: session.token,
        dealer_name: DEALER_NAME,
      });

      // Buscar novo vencimento
      const updatedList = await callUnitvApi(session, "account", {
        package_id: 1,
        dealer_token: session.token,
        dealer_name: DEALER_NAME,
        time_zone: "America/Sao_Paulo",
        page: 1,
        pageSize: 500,
      });
      const updated = (updatedList.list ?? []).find((u: any) => u.sn === usuario);
      const novoVenc = updated?.expireTime ? updated.expireTime.slice(0, 10) : undefined;

      if (novoVenc) {
        await pool.query(
          `UPDATE public.contas SET vencimento_real_painel = $1, status_conta = 'ok'
           WHERE id_servidor = $2 AND usuario = $3`,
          [novoVenc, idServidor, usuario]
        );
      }

      return { ok: true, novoVencimento: novoVenc };
    },
  };
}
