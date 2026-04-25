import { pool } from "@/lib/db";
import { criarClubAdapter } from "./club";
import type { PainelAdapter, ServidorCredenciais } from "./types";

export async function getAdapter(idServidor: number): Promise<PainelAdapter> {
  const { rows } = await pool.query<ServidorCredenciais & { painel_tipo: string }>(
    `SELECT painel_tipo, painel_url, painel_usuario, painel_senha, session_cookie, session_expiry
     FROM public.servidores WHERE id_servidor = $1`,
    [idServidor]
  );

  if (!rows.length) throw new Error(`Servidor ${idServidor} não encontrado.`);
  const creds = rows[0];
  if (!creds.painel_tipo) throw new Error(`Servidor ${idServidor} sem painel_tipo configurado.`);

  switch (creds.painel_tipo) {
    case "club":
      return criarClubAdapter(creds, idServidor);
    default:
      throw new Error(`Adapter para "${creds.painel_tipo}" ainda não implementado.`);
  }
}

export type { PainelAdapter, ContaPainel, ResultadoRenovacao } from "./types";
