import type {
  ContaPainel,
  PainelAdapter,
  ResultadoRenovacao,
  ResultadoTeste,
  ServidorCredenciais,
  SaveContaVencimento,
} from "./types";

// NATV (revenda.pixbot.link) — Bearer Token auth, sem sessão/captcha
// /report/allusers e /report/actionlog têm rate limit de 60s cada — cache em memória evita 429 em chamadas rápidas

const BASE_URL = "https://revenda.pixbot.link";

// Cache módulo-nível: compartilhado entre todas as instâncias do adapter NATV no mesmo processo
let _contasCache: { contas: ContaPainel[]; ts: number } | null = null;
let _creditosCache: { valor: number | null; ts: number } | null = null;
const CACHE_TTL_MS = 62_000;

// Campos abreviados do relatório /report/allusers — todos chegam como string
interface UserReportItem {
  i: string;   // id
  u: string;   // username
  p: string;   // password
  n: string;   // notes (rótulo)
  d: string;   // created_at ("YYYY-MM-DD HH:MM:SS")
  l: string;   // last_login ("YYYY-MM-DD HH:MM:SS")
  e: string;   // exp_date ("YYYY-MM-DD HH:MM:SS")
  r: string;   // reseller username
  c: string;   // max_connections
  o: string;   // owner
  t: string;   // status: "Ativo" | "Expirado" | "Bloqueado"
  b: string;   // blocked: "Yes" | "No"
  x: string | null;
}

interface ActionLogItem {
  a: string;          // action
  d: string;          // date
  b: number | string; // balance after action — API retorna como string (ex: "16.5")
}

function parseExpDate(e: string | undefined): string | null {
  if (!e) return null;
  // Formato: "YYYY-MM-DD HH:MM:SS" — pega só a data
  const date = e.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return date;
}

function resolverStatus(item: UserReportItem): ContaPainel["status"] {
  if (item.b === "Yes") return "bloqueada";
  if (item.t === "Expirado") return "vencida";
  return "ok";
}

function gerarUsername(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz0123456789";
  const prefixo = "nt";
  let s = prefixo;
  for (let i = 0; i < 7; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function criarNatvAdapter(
  creds: ServidorCredenciais,
  _id: number,
  _onSaveSession: unknown,
  onSaveContas: SaveContaVencimento,
): PainelAdapter {
  const token = creds.api_token;
  if (!token) throw new Error("NATV: api_token não configurado.");

  function authHeaders(): HeadersInit {
    return {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: { ...authHeaders(), ...(options.headers ?? {}) },
    });
    return res;
  }

  return {
    async listarContas(): Promise<ContaPainel[]> {
      const now = Date.now();
      if (_contasCache && now - _contasCache.ts < CACHE_TTL_MS) {
        return _contasCache.contas;
      }

      const res = await apiFetch("/report/allusers");

      if (res.status === 429) {
        // Rate limit de 60s — usa cache se disponível, senão erro amigável
        if (_contasCache) return _contasCache.contas;
        throw new Error("NATV: rate limit atingido. Aguarde 60s e tente novamente.");
      }
      if (!res.ok) throw new Error(`NATV listarContas → ${res.status}`);

      const data = await res.json() as UserReportItem[];
      if (!Array.isArray(data)) return [];

      const contas = data
        .map((item) => ({
          usuario:    item.u,
          rotulo:     item.n || item.u, // rótulo vazio → usa username como fallback
          vencimento: parseExpDate(item.e),
          status:     resolverStatus(item),
          senha:      item.p ?? null,
        }));

      _contasCache = { contas, ts: now };
      return contas;
    },

    async renovar(usuario: string, meses = 1): Promise<ResultadoRenovacao> {
      const res = await apiFetch("/user/activation", {
        method: "POST",
        body: JSON.stringify({ username: usuario, months: meses }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`NATV renovar → ${res.status}: ${txt}`);
      }

      const data = await res.json() as { exp_date?: string; expiration_date?: string };

      // Busca novo vencimento da resposta ou relista
      let novoVenc: string | undefined;
      const expRaw = data.exp_date ?? data.expiration_date;
      if (expRaw) {
        novoVenc = parseExpDate(expRaw) ?? undefined;
      } else {
        // Fallback: busca via /user/search
        try {
          const sr = await apiFetch("/user/search", {
            method: "POST",
            body: JSON.stringify({ username: usuario }),
          });
          if (sr.ok) {
            const sdata = await sr.json() as { exp_date?: string }[];
            if (Array.isArray(sdata) && sdata[0]?.exp_date) {
              novoVenc = parseExpDate(sdata[0].exp_date) ?? undefined;
            }
          }
        } catch { /* segue sem novo vencimento */ }
      }

      if (novoVenc) await onSaveContas(usuario, novoVenc);
      return { ok: true, novoVencimento: novoVenc };
    },

    async getCreditos(): Promise<number | null> {
      const now = Date.now();
      if (_creditosCache && now - _creditosCache.ts < CACHE_TTL_MS) {
        return _creditosCache.valor;
      }

      try {
        const res = await apiFetch("/report/actionlog");
        if (res.status === 429) {
          // Rate limit de 60s — usa cache se disponível, senão desiste sem sobrescrever
          if (_creditosCache) return _creditosCache.valor;
          return null;
        }
        if (!res.ok) return null;

        const data = await res.json() as ActionLogItem[];
        if (!Array.isArray(data) || data.length === 0) return null;

        // O campo b é o saldo após a ação — pega o mais recente
        const ultimo = data[0];
        const saldoRaw = typeof ultimo.b === "string" ? parseFloat(ultimo.b) : ultimo.b;
        const saldo = Number.isFinite(saldoRaw) ? saldoRaw : null;

        _creditosCache = { valor: saldo, ts: now };
        return saldo;
      } catch {
        if (_creditosCache) return _creditosCache.valor;
        return null;
      }
    },

    async gerarTeste({ horas = 1 } = {}): Promise<ResultadoTeste> {
      const novoUser  = gerarUsername();
      const minutos   = Math.min(Math.max(horas * 60, 15), 360);

      const res = await apiFetch("/user", {
        method: "POST",
        body: JSON.stringify({ username: novoUser, minutes: minutos }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`NATV gerarTeste → ${res.status}: ${txt}`);
      }

      const data = await res.json() as {
        username?: string;
        password?: string;
        exp_date?: string;
      };

      return {
        ok:        true,
        usuario:   data.username ?? novoUser,
        senha:     data.password ?? undefined,
        expiracao: data.exp_date ? parseExpDate(data.exp_date) ?? undefined : undefined,
      };
    },
  };
}
