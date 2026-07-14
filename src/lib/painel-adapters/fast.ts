import type { ContaPainel, PainelAdapter, ResultadoRenovacao, ResultadoEdicao, ResultadoTeste, ServidorCredenciais, SaveSession, SaveContaVencimento } from "./types";

// API base: https://api.painelcliente.com
// Auth: token permanente na URL + secret no body JSON
// Credenciais armazenadas em servidores.api_token e servidores.api_secret
// Swagger: https://painelcliente.com/swagger (OAS 3.0, requer login)

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

// Gera credencial aleatória: 8 chars alfanuméricos lowercase
function gerarCredencial(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
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
          ? new Date(Number(c.exp_date) * 1000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
          : null,
        status: mapStatus(c.enabled ?? 1, c.exp_date ?? 0),
        senha: c.password ?? null,
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
        ? new Date(Number(data.exp_date) * 1000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
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

    async editarConta(usuario: string, campos: { novaSenha?: string; novoRotulo?: string }): Promise<ResultadoEdicao> {
      const { token, secret } = getCredentials(creds);
      const body: Record<string, unknown> = { secret, username: usuario };
      if (campos.novaSenha)   body.password = campos.novaSenha;
      if (campos.novoRotulo !== undefined) body.notes = campos.novoRotulo;
      await apiFetch(token, "update_client", body);
      return { ok: true };
    },

    async gerarTeste({ rotulo = "" } = {}): Promise<ResultadoTeste> {
      const { token, secret } = getCredentials(creds);
      // Busca bouquets disponíveis para incluir no teste
      let bouquets: number[] = [];
      try {
        const bdata = await apiFetch(token, "bouquets", { secret });
        const list: any[] = Array.isArray(bdata) ? bdata : Object.values(bdata);
        bouquets = list.map((b: any) => Number(b.id ?? b.bouquet_id)).filter(Boolean);
      } catch { /* usa bouquets vazio se falhar */ }

      const usuario = gerarCredencial();
      const senha   = gerarCredencial();

      const data = await apiFetch(token, "trial_create", {
        secret,
        username:   usuario,
        password:   senha,
        idbouquet:  bouquets,
        notes:      rotulo,
      });

      // exp_date em timestamp Unix
      const expDate = data?.exp_date ? new Date(Number(data.exp_date) * 1000) : undefined;
      const expiracao = expDate?.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
      const expiracaoHorario = expDate?.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

      return { ok: true, usuario, senha, expiracao, expiracaoHorario };
    },

    async deletarConta(usuario: string): Promise<void> {
      const { token, secret } = getCredentials(creds);
      await apiFetch(token, "delete_client", { secret, username: usuario });
    },
  };
}
