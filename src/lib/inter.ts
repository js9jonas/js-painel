// src/lib/inter.ts — API Pix do Banco Inter (OAuth2 + certificado mTLS).
// Só o que o link de pagamento usa: cobrança imediata (cob), consulta e webhook.
// Não usamos cobv (com vencimento): pela spec do Bacen ela exige CPF/CNPJ do devedor, que não temos.
import { Agent, fetch } from "undici";

const BASE = "https://cdpj.partners.bancointer.com.br";
const ESCOPOS = "cob.write cob.read webhook.write webhook.read";
const TIMEOUT_MS = 15_000;

/** Chave Pix (CNPJ) que recebe as cobranças — a mesma divulgada aos clientes. */
export const CHAVE_PIX = "40827286000106";

export class ErroInter extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function lerEnv(nome: string): string {
  const v = process.env[nome]?.trim();
  if (!v) throw new ErroInter(`Variável ${nome} não configurada`, 500);
  return v;
}

// Certificado e chave chegam em base64 (Easypanel não guarda arquivo); ficam só em memória.
let agente: Agent | null = null;
function agenteMtls(): Agent {
  if (!agente) {
    agente = new Agent({
      connect: {
        cert: Buffer.from(lerEnv("INTER_CERT_BASE64"), "base64"),
        key: Buffer.from(lerEnv("INTER_KEY_BASE64"), "base64"),
      },
    });
  }
  return agente;
}

let tokenCache: { valor: string; expiraEm: number } | null = null;

async function obterToken(): Promise<string> {
  if (tokenCache && tokenCache.expiraEm > Date.now() + 60_000) return tokenCache.valor;
  const res = await fetch(`${BASE}/oauth/v2/token`, {
    method: "POST",
    dispatcher: agenteMtls(),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: lerEnv("INTER_CLIENT_ID"),
      client_secret: lerEnv("INTER_CLIENT_SECRET"),
      grant_type: "client_credentials",
      scope: ESCOPOS,
    }).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const texto = await res.text();
  if (!res.ok) throw new ErroInter(`Inter recusou o login (HTTP ${res.status}): ${texto.slice(0, 200)}`, res.status);
  const json = JSON.parse(texto) as { access_token: string; expires_in: number };
  tokenCache = { valor: json.access_token, expiraEm: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function chamar<T>(metodo: string, caminho: string, corpo?: unknown, tentativa = 1): Promise<T> {
  const token = await obterToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (corpo !== undefined) headers["Content-Type"] = "application/json";
  // Integração ligada a mais de uma conta exige o número da conta no cabeçalho
  const conta = process.env.INTER_ACCOUNT_NUMBER?.trim();
  if (conta) headers["x-conta-corrente"] = conta;

  const res = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    dispatcher: agenteMtls(),
    headers,
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  // Token derrubado antes da hora: busca outro uma vez
  if (res.status === 401 && tentativa === 1) {
    tokenCache = null;
    return chamar<T>(metodo, caminho, corpo, 2);
  }
  const texto = await res.text();
  if (!res.ok) {
    let detalhe = texto.slice(0, 300);
    try {
      const j = JSON.parse(texto);
      detalhe = [j.title, j.detail, ...(j.violacoes ?? []).map((v: { razao?: string }) => v.razao)]
        .filter(Boolean).join(" — ") || detalhe;
    } catch { }
    throw new ErroInter(`Inter ${metodo} ${caminho} (HTTP ${res.status}): ${detalhe}`, res.status);
  }
  return (texto ? JSON.parse(texto) : {}) as T;
}

export type PixRecebido = {
  endToEndId: string;
  txid?: string;
  valor: string;
  horario: string;
  pagador?: { nome?: string; cpf?: string; cnpj?: string };
  nomePagador?: string;
};

export type CobInter = {
  txid: string;
  status: "ATIVA" | "CONCLUIDA" | "REMOVIDA_PELO_USUARIO_RECEBEDOR" | "REMOVIDA_PELO_PSP";
  calendario: { criacao: string; expiracao: number };
  valor: { original: string };
  pixCopiaECola?: string;
  pix?: PixRecebido[];
};

/** txid aceito pelo Bacen: 26 a 35 caracteres [a-zA-Z0-9]. */
export function novoTxid(): string {
  return crypto.randomUUID().replace(/-/g, ""); // 32 caracteres hex
}

export function criarCob(txid: string, valor: number, expiracaoSegundos: number, mensagem: string): Promise<CobInter> {
  return chamar<CobInter>("PUT", `/pix/v2/cob/${txid}`, {
    calendario: { expiracao: expiracaoSegundos },
    valor: { original: valor.toFixed(2), modalidadeAlteracao: 0 }, // valor fixo, o pagador não muda
    chave: CHAVE_PIX,
    solicitacaoPagador: mensagem.slice(0, 140),
  });
}

export function consultarCob(txid: string): Promise<CobInter> {
  return chamar<CobInter>("GET", `/pix/v2/cob/${txid}`);
}

export function configurarWebhook(webhookUrl: string): Promise<unknown> {
  return chamar("PUT", `/pix/v2/webhook/${CHAVE_PIX}`, { webhookUrl });
}

export function consultarWebhook(): Promise<unknown> {
  return chamar("GET", `/pix/v2/webhook/${CHAVE_PIX}`);
}
