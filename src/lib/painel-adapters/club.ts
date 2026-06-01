import type { ContaPainel, PainelAdapter, ResultadoRenovacao, ServidorCredenciais, SaveSession, SaveContaVencimento } from "./types";

const API_URL = "https://pdcapi.io/";
const LOGIN_URL = "https://dashboard.bz/ss.php";

function getToken(creds: ServidorCredenciais): string {
  if (creds.session_cookie && creds.session_expiry && new Date(creds.session_expiry) > new Date()) {
    return creds.session_cookie;
  }
  throw new Error("Token CLUB expirado. Faça login manual no painel e cole o token via botão 'Atualizar token'.");
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

export function criarClubAdapter(creds: ServidorCredenciais, _id: number, _onSaveSession: SaveSession, onSaveContas: SaveContaVencimento): PainelAdapter {
  return {
    async listarContas(): Promise<ContaPainel[]> {
      const token = getToken(creds);
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
      const token = getToken(creds);

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
        await onSaveContas(usuario, novoVenc);
        return { ok: true, novoVencimento: novoVenc, comprovante: result.comprovante };
      }

      return { ok: true };
    },
  };
}
