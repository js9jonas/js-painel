import type { ContaPainel, PainelAdapter, ResultadoRenovacao, ServidorCredenciais, SaveSession, SaveContaVencimento } from "./types";

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

export function criarFastAdapter(creds: ServidorCredenciais, _id: number, _onSaveSession: SaveSession, onSaveContas: SaveContaVencimento): PainelAdapter {
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

      if (novoVenc) await onSaveContas(usuario, novoVenc);

      return { ok: true, novoVencimento: novoVenc };
    },

    async getCreditos(): Promise<number | null> {
      const { token, secret } = getCredentials(creds);
      try {
        const data = await apiFetch(token, "profile", { secret });
        const valor = data?.credits ?? data?.credit ?? data?.saldo ?? null;
        return valor !== null ? Number(valor) : null;
      } catch {
        return null;
      }
    },
  };
}
