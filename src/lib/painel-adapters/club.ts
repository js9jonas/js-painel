import { pool } from "@/lib/db";
import type { ContaPainel, PainelAdapter, ResultadoRenovacao, ServidorCredenciais } from "./types";

const API_URL = "https://pdcapi.io/";
const LOGIN_URL = "https://dashboard.bz/ss.php";

async function getToken(creds: ServidorCredenciais): Promise<string> {
  // Token válido no banco
  if (creds.session_cookie && creds.session_expiry && new Date(creds.session_expiry) > new Date()) {
    return creds.session_cookie;
  }
  throw new Error("Token expirado. Faça login manual no painel CLUB para renovar a sessão.");
}

async function atualizarToken(idServidor: number, token: string) {
  await pool.query(
    `UPDATE public.servidores
     SET session_cookie = $1, session_expiry = now() + interval '7 days'
     WHERE id_servidor = $2`,
    [token, idServidor]
  );
}

async function apiFetch(token: string, path: string, options: RequestInit = {}) {
  const res = await fetch(API_URL + path, {
    ...options,
    headers: {
      "X-ACCESS-TOKEN": token,
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`pdcapi.io/${path} → ${res.status}`);
  return res.json();
}

function mapStatus(s: string | number): ContaPainel["status"] {
  if (String(s) === "1") return "ok";
  if (String(s) === "0") return "bloqueada";
  return "vencida";
}

export function criarClubAdapter(creds: ServidorCredenciais, idServidor: number): PainelAdapter {
  return {
    async listarContas(): Promise<ContaPainel[]> {
      const token = await getToken(creds);
      const body = new URLSearchParams({ draw: "1", start: "0", length: "2000" });
      const data = await apiFetch(token, "listas/minhas", { method: "POST", body });

      return (data.data ?? []).map((l: any) => ({
        usuario: l.username,
        rotulo: l.reseller_notes || "",
        vencimento: l.exp_date ? new Date(Number(l.exp_date) * 1000).toISOString().slice(0, 10) : null,
        status: mapStatus(l.status),
      }));
    },

    async renovar(usuario: string, meses = 1): Promise<ResultadoRenovacao> {
      const token = await getToken(creds);

      // Busca o ID interno da conta pelo username
      const lista = await apiFetch(token, "listas/minhas", {
        method: "POST",
        body: new URLSearchParams({ draw: "1", start: "0", length: "2000" }),
      });
      const conta = (lista.data ?? []).find((l: any) => l.username === usuario);
      if (!conta) return { ok: false, erro: `Usuário "${usuario}" não encontrado no CLUB.` };

      const body = new URLSearchParams({ tempo: String(meses) });
      const result = await apiFetch(token, `listas/${conta.id}/renovar`, { method: "POST", body });

      if (!result.result) {
        return { ok: false, erro: result.msg ?? "Erro ao renovar no CLUB." };
      }

      // Atualiza vencimento na tabela contas
      if (result.exp_date) {
        const novoVenc = new Date(Number(result.exp_date) * 1000).toISOString().slice(0, 10);
        await pool.query(
          `UPDATE public.contas SET vencimento_real_painel = $1, status_conta = 'ok'
           WHERE id_servidor = $2 AND usuario = $3`,
          [novoVenc, idServidor, usuario]
        );
        return { ok: true, novoVencimento: novoVenc, comprovante: result.comprovante };
      }

      return { ok: true };
    },
  };
}
