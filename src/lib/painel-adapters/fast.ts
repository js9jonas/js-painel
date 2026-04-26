import { pool } from "@/lib/db";
import type { ContaPainel, PainelAdapter, ResultadoRenovacao, ServidorCredenciais } from "./types";

// API base: https://api.painelcliente.com
// Auth: token permanente na URL + secret no body JSON
// Credenciais armazenadas em servidores.api_token e servidores.api_secret

const API_BASE = "https://api.painelcliente.com";

function getCredentials(creds: ServidorCredenciais): { token: string; secret: string } {
  if (!creds.api_token || !creds.api_secret) {
    throw new Error("Credenciais da API FAST não configuradas (api_token / api_secret).");
  }
  return { token: creds.api_token, secret: creds.api_secret };
}

async function apiFetch(token: string, path: string, body: Record<string, unknown>) {
  const res = await fetch(`${API_BASE}/${path}/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`api.painelcliente.com/${path} → ${res.status}`);
  const data = await res.json();
  if (!data.result) throw new Error(data.mens ?? "Erro na API FAST.");
  return data.data;
}

function mapStatus(enabled: number, expDate: number): ContaPainel["status"] {
  if (enabled === 0) return "bloqueada";
  if (expDate && new Date(expDate * 1000) < new Date()) return "vencida";
  return "ok";
}

export function criarFastAdapter(creds: ServidorCredenciais, idServidor: number): PainelAdapter {
  return {
    async listarContas(): Promise<ContaPainel[]> {
      const { token, secret } = getCredentials(creds);
      const data = await apiFetch(token, "get_clients_all", { secret, limit: 500 });
      const clients: any[] = Array.isArray(data) ? data : Object.values(data);

      return clients.map((c: any) => ({
        usuario: c.username,
        rotulo: c.reseller_notes || "",
        vencimento: c.exp_date
          ? new Date(Number(c.exp_date) * 1000).toISOString().slice(0, 10)
          : null,
        status: mapStatus(c.enabled ?? 1, c.exp_date ?? 0),
      }));
    },

    async renovar(usuario: string, meses = 1): Promise<ResultadoRenovacao> {
      const { token, secret } = getCredentials(creds);

      const data = await apiFetch(token, "renew_client", {
        secret,
        username: usuario,
        month: meses,
      });

      const novoVenc = data?.exp_date
        ? new Date(Number(data.exp_date) * 1000).toISOString().slice(0, 10)
        : undefined;

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
