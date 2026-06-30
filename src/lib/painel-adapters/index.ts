import { pool } from "@/lib/db";
import { criarClubAdapter } from "./club";
import { criarCentralAdapter } from "./central";
import { criarFastAdapter } from "./fast";
import { criarFunPlaysAdapter } from "./funplays";
import { criarLazerPlayAdapter } from "./lazerplay";
import { criarCorePlayerAdapter } from "./coreplayer";
import { criarSmartOneAdapter } from "./smartone";
import { criarUniplayAdapter } from "./uniplay";
import { criarNowAdapter } from "./now";
import { criarUnitvAdapter } from "./unitv";
import { criarLiebeAdapter } from "./liebe";
import { criarNatvAdapter } from "./natv";
import type { PainelAdapter, ServidorCredenciais, SaveSession, SaveContaVencimento } from "./types";

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

  const onSaveSession: SaveSession = async (cookie, expiry) => {
    await pool.query(
      `UPDATE public.painel_servidores SET session_cookie = $1, session_expiry = $2 WHERE id = $3`,
      [cookie, expiry ?? null, idPainelServidor]
    );
  };

  const onSaveContas: SaveContaVencimento = async (usuario, novoVenc) => {
    await pool.query(
      `UPDATE public.contas SET vencimento_real_painel = $1, status_conta = 'ok'
       WHERE id_painel_servidor = $2 AND usuario = $3`,
      [novoVenc, idPainelServidor, usuario]
    );
  };

  return buildAdapter(creds, idPainelServidor, onSaveSession, onSaveContas);
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

  const onSaveSession: SaveSession = async (cookie, expiry) => {
    await pool.query(
      `UPDATE public.servidores SET session_cookie = $1, session_expiry = $2 WHERE id_servidor = $3`,
      [cookie, expiry ?? null, idServidor]
    );
  };

  const onSaveContas: SaveContaVencimento = async (usuario, novoVenc) => {
    await pool.query(
      `UPDATE public.contas SET vencimento_real_painel = $1, status_conta = 'ok'
       WHERE id_servidor = $2 AND usuario = $3`,
      [novoVenc, idServidor, usuario]
    );
  };

  return buildAdapter(creds, idServidor, onSaveSession, onSaveContas);
}

function buildAdapter(
  creds: ServidorCredenciais & { painel_tipo: string },
  id: number,
  onSaveSession: SaveSession,
  onSaveContas: SaveContaVencimento
): PainelAdapter {
  switch (creds.painel_tipo) {
    case "club":    return criarClubAdapter(creds, id, onSaveSession, onSaveContas);
    case "central": return criarCentralAdapter(creds, id, onSaveSession, onSaveContas);
    case "fast":    return criarFastAdapter(creds, id, onSaveSession, onSaveContas);
    case "uniplay": return criarUniplayAdapter(creds, id, onSaveSession, onSaveContas);
    case "now":     return criarNowAdapter(creds, id, onSaveSession, onSaveContas);
    case "unitv":   return criarUnitvAdapter(creds, id, onSaveSession, onSaveContas);
    case "liebe":    return criarLiebeAdapter(creds, id, onSaveSession, onSaveContas);
    case "funplays":    return criarFunPlaysAdapter(creds, id, onSaveSession, onSaveContas);
    case "lazerplay":   return criarLazerPlayAdapter(creds, id, onSaveSession, onSaveContas);
    case "coreplayer":  return criarCorePlayerAdapter(creds, id, onSaveSession, onSaveContas);
    case "smartone":    return criarSmartOneAdapter(creds, id, onSaveSession, onSaveContas);
    case "natv":        return criarNatvAdapter(creds, id, onSaveSession, onSaveContas);
    default:
      throw new Error(`Adapter para "${creds.painel_tipo}" ainda não implementado.`);
  }
}

export type { PainelAdapter, ContaPainel, ResultadoRenovacao } from "./types";
