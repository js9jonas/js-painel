import type { ContaPainel, PainelAdapter, ResultadoRenovacao, ServidorCredenciais, SaveSession, SaveContaVencimento } from "./types";

// API base: https://api.controle.fit/api
// Auth: JWT Bearer, expira em 1h
// Login requer Cloudflare Turnstile (só via browser)

const API_BASE = "https://api.controle.fit/api";

function getToken(creds: ServidorCredenciais): string {
  if (creds.session_cookie) {
    const expirado = creds.session_expiry && new Date(creds.session_expiry) <= new Date();
    if (!expirado) return creds.session_cookie;
  }
  throw new Error("Token CENTRAL expirado. Acesse painel.fun, copie o JWT e cole via botão 'Atualizar token'.");
}

async function apiFetch(token: string, path: string, options: RequestInit = {}) {
  const url = `${API_BASE}/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`controle.fit/${path} → ${res.status}: ${msg.substring(0, 200)}`);
  }
  return res.json();
}

function mapStatus(enabled: number, expDate: number): ContaPainel["status"] {
  if (enabled === 0) return "bloqueada";
  if (expDate && new Date(expDate * 1000) < new Date()) return "vencida";
  return "ok";
}

export function criarCentralAdapter(creds: ServidorCredenciais, _id: number, _onSaveSession: SaveSession, onSaveContas: SaveContaVencimento): PainelAdapter {
  return {
    async listarContas(): Promise<ContaPainel[]> {
      const token = getToken(creds);

      const allUsers: any[] = [];
      let page = 1;
      const per = 100; // servidor limita a 100/página

      while (true) {
        const data = await apiFetch(
          token,
          `users?page=${page}&per=${per}&reseller=${creds.painel_usuario}`
        );
        const users: any[] = data.data ?? [];
        allUsers.push(...users);
        if (allUsers.length >= (data.meta?.total ?? 0) || users.length < per) break;
        page++;
      }

      return allUsers.map((u: any) => ({
        usuario: u.username,
        rotulo: u.reseller_notes || u.full_name || "",
        vencimento: u.exp_date
          ? new Date(Number(u.exp_date) * 1000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
          : null,
        status: mapStatus(u.enabled ?? 1, u.exp_date ?? 0),
      }));
    },

    async renovar(usuario: string, _meses = 1): Promise<ResultadoRenovacao> {
      const token = getToken(creds);

      // Busca ID interno pelo username (paginação até achar)
      let page = 1;
      const per = 100;
      let conta: any = null;

      while (!conta) {
        const data = await apiFetch(
          token,
          `users?page=${page}&per=${per}&reseller=${creds.painel_usuario}`
        );
        const users: any[] = data.data ?? [];
        conta = users.find((u: any) => u.username === usuario);
        if (!conta && users.length < per) break;
        page++;
      }

      if (!conta) {
        return { ok: false, erro: `Usuário "${usuario}" não encontrado no CENTRAL.` };
      }

      // mounth (typo intencional do servidor)
      const result = await apiFetch(token, `users/${conta.id}/renew`, {
        method: "POST",
        body: JSON.stringify({ mounth: 1 }),
      });

      const novoVenc = result.exp_date
        ? new Date(Number(result.exp_date) * 1000).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
        : undefined;

      if (novoVenc) await onSaveContas(usuario, novoVenc);
      return { ok: true, novoVencimento: novoVenc };
    },
  };
}
