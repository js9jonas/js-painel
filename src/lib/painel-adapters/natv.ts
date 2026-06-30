import type {
  ContaPainel,
  PainelAdapter,
  ResultadoRenovacao,
  ResultadoTeste,
  ServidorCredenciais,
  SaveContaVencimento,
} from "./types";

// NATV (revenda.pixbot.link) — Bearer Token auth, sem sessão/captcha

const BASE_URL = "https://revenda.pixbot.link";

// Campos abreviados do relatório /report/allusers
interface UserReportItem {
  i: number;   // id
  u: string;   // username
  p: string;   // password
  n: string;   // notes (rótulo)
  d: string;   // domain
  l: number;   // last_login (Unix timestamp)
  e: number;   // exp_date (Unix timestamp em segundos)
  r: number;   // reseller id
  c: number;   // max_connections
  o: string;   // owner
  t: number;   // is_test (1 = conta de teste)
  b: number;   // blocked (1 = bloqueada)
  x: number;   // enabled
}

interface ActionLogItem {
  a: string;   // action
  d: string;   // date
  b: number;   // balance after action
}

function parseExpDate(e: number | string | undefined): string | null {
  if (!e) return null;
  const ts = typeof e === "string" ? Number(e) : e;
  if (!ts || isNaN(ts)) return null;
  // Unix timestamp em segundos
  const d = new Date(ts * 1000);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function resolverStatus(item: UserReportItem): ContaPainel["status"] {
  if (item.b === 1) return "bloqueada";
  const venc = parseExpDate(item.e);
  if (venc && venc < new Date().toISOString().slice(0, 10)) return "vencida";
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
      const res = await apiFetch("/report/allusers");
      if (!res.ok) throw new Error(`NATV listarContas → ${res.status}`);
      const data = await res.json() as UserReportItem[];
      if (!Array.isArray(data)) return [];

      return data
        .filter((item) => item.t !== 1) // exclui contas de teste
        .map((item) => ({
          usuario:    item.u,
          rotulo:     item.n ?? "",
          vencimento: parseExpDate(item.e),
          status:     resolverStatus(item),
          senha:      item.p ?? null,
        }));
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

      const data = await res.json() as { exp_date?: number; expiration_date?: number };

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
            const sdata = await sr.json() as { exp_date?: number }[];
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
      try {
        const res = await apiFetch("/report/actionlog");
        if (!res.ok) return null;
        const data = await res.json() as ActionLogItem[];
        if (!Array.isArray(data) || data.length === 0) return null;
        // O campo b é o saldo após a ação — pega o mais recente
        const ultimo = data[0];
        return typeof ultimo.b === "number" ? ultimo.b : null;
      } catch { return null; }
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
        exp_date?: number;
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
