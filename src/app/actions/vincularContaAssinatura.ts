"use server";

import { pool } from "@/lib/db";
import { revalidatePath } from "next/cache";

export async function vincularContaAssinatura(idConta: number, idAssinatura: number) {
  await pool.query(
    `UPDATE public.contas SET id_assinatura = $1 WHERE id_conta = $2`,
    [idAssinatura, idConta]
  );
  revalidatePath("/conexoes/vinculacao");
}

export async function desvincularContaAssinatura(idConta: number) {
  await pool.query(
    `UPDATE public.contas SET id_assinatura = NULL WHERE id_conta = $1`,
    [idConta]
  );
  revalidatePath("/conexoes/vinculacao");
}

export async function autoVincularConfiantes(): Promise<{ vinculados: number }> {
  const { rowCount } = await pool.query(`
    UPDATE public.contas c
    SET id_assinatura = best.id_assinatura
    FROM (
      SELECT DISTINCT ON (c2.id_conta)
        c2.id_conta,
        a.id_assinatura
      FROM public.contas c2
      JOIN public.painel_servidores ps ON ps.id = c2.id_painel_servidor
      JOIN public.assinaturas a ON a.venc_contas = c2.vencimento_real_painel
      JOIN public.clientes cl ON cl.id_cliente = a.id_cliente
      JOIN public.pacote pk ON pk.id_pacote = a.id_pacote
      WHERE c2.id_assinatura IS NULL
        AND c2.vencimento_real_painel IS NOT NULL
        AND c2.removido_em IS NULL
        AND a.status IN ('ativo', 'atrasado')
        AND lower(pk.contrato) ILIKE '%' || lower(ps.nome) || '%'
        AND similarity(cl.nome, COALESCE(NULLIF(c2.rotulo, ''), c2.usuario)) >= 0.7
      ORDER BY c2.id_conta,
               similarity(cl.nome, COALESCE(NULLIF(c2.rotulo, ''), c2.usuario)) DESC
    ) best
    WHERE c.id_conta = best.id_conta
  `);
  revalidatePath("/conexoes/vinculacao");
  return { vinculados: rowCount ?? 0 };
}

export type AssinaturaBuscaRow = {
  id_assinatura: number;
  id_cliente: number;
  nome_cliente: string;
  venc_contas: string;
  status: string;
};

export async function buscarAssinaturas(q: string): Promise<AssinaturaBuscaRow[]> {
  if (!q.trim()) return [];
  const { rows } = await pool.query<AssinaturaBuscaRow>(
    `SELECT a.id_assinatura, a.id_cliente, cl.nome AS nome_cliente,
            a.venc_contas::text, a.status
     FROM public.assinaturas a
     JOIN public.clientes cl ON cl.id_cliente = a.id_cliente
     WHERE cl.nome ILIKE $1 AND a.status IN ('ativo', 'atrasado', 'pendente')
     ORDER BY cl.nome ASC
     LIMIT 20`,
    [`%${q}%`]
  );
  return rows;
}
