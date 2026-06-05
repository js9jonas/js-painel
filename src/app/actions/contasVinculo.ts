"use server";

import { pool } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function desvincularconta(idConta: string, idCliente: string): Promise<{ ok: boolean; erro?: string }> {
  try {
    await pool.query(
      `UPDATE public.contas SET id_assinatura = NULL WHERE id_conta = $1::bigint`,
      [idConta]
    );
    revalidatePath(`/clientes/${idCliente}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro ao desvincular." };
  }
}

export async function vincularContaExistente(
  idConta: string,
  idAssinatura: string,
  idCliente: string
): Promise<{ ok: boolean; erro?: string }> {
  try {
    await pool.query(
      `UPDATE public.contas SET id_assinatura = $1::bigint WHERE id_conta = $2::bigint`,
      [idAssinatura, idConta]
    );
    revalidatePath(`/clientes/${idCliente}`);
    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro ao vincular." };
  }
}

export type ContaLivre = {
  id_conta: string;
  usuario: string;
  rotulo: string | null;
  observacao: string | null;
  vencimento_real_painel: string | null;
  status_conta: string | null;
  id_painel_servidor: number;
};

export async function buscarContasLivres(
  idPainelServidor: number,
  query: string
): Promise<ContaLivre[]> {
  const q = `%${query.trim()}%`;
  const { rows } = await pool.query<ContaLivre>(
    `SELECT id_conta::text, usuario, rotulo, observacao,
            vencimento_real_painel::text, status_conta, id_painel_servidor
     FROM public.contas
     WHERE id_painel_servidor = $1
       AND id_assinatura IS NULL
       AND removido_em IS NULL
       AND ($2 = '%%' OR usuario ILIKE $2 OR rotulo ILIKE $2 OR observacao ILIKE $2)
     ORDER BY usuario
     LIMIT 50`,
    [idPainelServidor, q]
  );
  return rows;
}
