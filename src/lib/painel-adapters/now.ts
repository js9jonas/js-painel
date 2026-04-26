import { pool } from "@/lib/db";
import type { ContaPainel, PainelAdapter, ResultadoRenovacao, ServidorCredenciais } from "./types";

// Painel N (pnw7.cc) — PHP session, sem auto-login (reCAPTCHA obrigatório)
// Sessão manual: Jonas loga no painel, PHPSESSID salvo em servidores.session_cookie
// Quando expirar: POST /api/servidores/[id]/atualizar-token com { token: "PHPSESSID=..." }

const BASE_URL = "https://pnw7.cc/painel";

function getSession(creds: ServidorCredenciais): string {
  if (!creds.session_cookie) {
    throw new Error(
      'NOW: sessão expirada. Faça login em https://pnw7.cc/painel/z=EmRthTY3kTO ' +
      'e atualize via POST /api/servidores/4/atualizar-token com { token: "PHPSESSID=..." }'
    );
  }
  if (creds.session_expiry && new Date(creds.session_expiry) < new Date()) {
    throw new Error(
      'NOW: sessão expirada. Faça login em https://pnw7.cc/painel/z=EmRthTY3kTO ' +
      'e atualize via POST /api/servidores/4/atualizar-token com { token: "PHPSESSID=..." }'
    );
  }
  return creds.session_cookie;
}

// codrev é derivado da painel_url (parte após z=)
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

function parseUsername(cell0: string): string {
  const m = cell0.match(/value="([^"]+)"/);
  return m ? m[1] : "";
}

function parseNome(cell1: string): string {
  // "Nome Completo<br>..." → pegar texto antes do <br>
  return cell1.replace(/<br[\s\S]*/, "").replace(/<[^>]+>/g, "").trim();
}

function parseVencimento(cell3: string): string | null {
  // "17/05/2026 às 00:04h" → "2026-05-17"
  const m = cell3.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function parseStatus(cell3: string): ContaPainel["status"] {
  if (cell3.includes("label-danger")) return "vencida";
  if (cell3.includes("label-warning")) return "bloqueada";
  return "ok";
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

export function criarNowAdapter(creds: ServidorCredenciais, idServidor: number): PainelAdapter {
  return {
    async listarContas(): Promise<ContaPainel[]> {
      const session = getSession(creds);
      const codrev = getCodrev(creds.painel_url);
      const usuario = creds.painel_usuario;

      const res = await phpFetch(
        session, codrev,
        `usuario-status-processo.php?usuario=${usuario}&status=Todos&perfil=`,
        buildDataTablesParams()
      );
      if (!res.ok) throw new Error(`NOW listarContas → ${res.status}`);
      const json = await res.json();
      const rows: string[][] = json.data ?? [];

      return rows.map((row) => ({
        usuario: parseUsername(row[0]),
        rotulo: parseNome(row[1]),
        vencimento: parseVencimento(row[3]),
        status: parseStatus(row[3]),
      })).filter((c) => c.usuario !== "");
    },

    async renovar(usuario: string, meses = 1): Promise<ResultadoRenovacao> {
      const session = getSession(creds);
      const codrev = getCodrev(creds.painel_url);

      const body = new URLSearchParams({ id: usuario, qtdMes: String(meses) });
      const res = await phpFetch(session, codrev, "EnviarRenovarUsuario.php", body);
      if (!res.ok) throw new Error(`NOW renovar → ${res.status}`);

      // Buscar novo vencimento na listagem atualizada
      const listaRes = await phpFetch(
        session, codrev,
        `usuario-status-processo.php?usuario=${creds.painel_usuario}&status=Todos&perfil=`,
        buildDataTablesParams()
      );
      const lista = await listaRes.json();
      const rows: string[][] = lista.data ?? [];
      const row = rows.find((r) => parseUsername(r[0]) === usuario);
      const novoVenc = row ? parseVencimento(row[3]) ?? undefined : undefined;

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
