import { pool } from "@/lib/db";
import { criarClubAdapter } from "./club";
import { criarCentralAdapter } from "./central";
import { criarFastAdapter } from "./fast";
import { criarUniplayAdapter } from "./uniplay";
import { criarNowAdapter } from "./now";
import { criarUnitvAdapter } from "./unitv";
import type { PainelAdapter, ServidorCredenciais } from "./types";

// Lê credenciais de painel_servidores (nova arquitetura)
export async function getAdapterPainel(idPainelServidor: number): Promise<PainelAdapter> {
  const { rows } = await pool.query<ServidorCredenciais & { tipo: string }>(
    `SELECT tipo AS painel_tipo, url_painel AS painel_url, usuario AS painel_usuario,
            senha AS painel_senha, session_cookie, session_expiry, api_token, api_secret
     FROM public.painel_servidores WHERE id = $1`,
    [idPainelServidor]
  );

  if (!rows.length) throw new Error(`Painel ${idPainelServidor} não encontrado.`);
  const creds = rows[0] as unknown as ServidorCredenciais & { painel_tipo: string };

  return buildAdapter(creds, idPainelServidor);
}

// Mantido por compatibilidade com rotas existentes (lê de servidores)
export async function getAdapter(idServidor: number): Promise<PainelAdapter> {
  const { rows } = await pool.query<ServidorCredenciais & { painel_tipo: string }>(
    `SELECT painel_tipo, painel_url, painel_usuario, painel_senha, session_cookie, session_expiry, api_token, api_secret
     FROM public.servidores WHERE id_servidor = $1`,
    [idServidor]
  );

  if (!rows.length) throw new Error(`Servidor ${idServidor} não encontrado.`);
  const creds = rows[0];
  if (!creds.painel_tipo) throw new Error(`Servidor ${idServidor} sem painel_tipo configurado.`);

  return buildAdapter(creds, idServidor);
}

function buildAdapter(creds: ServidorCredenciais & { painel_tipo: string }, id: number): PainelAdapter {
  switch (creds.painel_tipo) {
    case "club":    return criarClubAdapter(creds, id);
    case "central": return criarCentralAdapter(creds, id);
    case "fast":    return criarFastAdapter(creds, id);
    case "uniplay": return criarUniplayAdapter(creds, id);
    case "now":     return criarNowAdapter(creds, id);
    case "unitv":   return criarUnitvAdapter(creds, id);
    default:
      throw new Error(`Adapter para "${creds.painel_tipo}" ainda não implementado.`);
  }
}

export type { PainelAdapter, ContaPainel, ResultadoRenovacao } from "./types";
