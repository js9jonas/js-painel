"use server";

import { pool } from "@/lib/db";
import { registrarAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

export async function desvincularconta(idConta: string, idCliente: string): Promise<{ ok: boolean; erro?: string }> {
  const client = await pool.connect();
  try {
    // Busca dados antes de desvincular para o audit
    const { rows } = await client.query(
      `SELECT c.usuario, c.id_assinatura, ps.nome AS nome_painel
       FROM public.contas c
       LEFT JOIN public.painel_servidores ps ON ps.id = c.id_painel_servidor
       WHERE c.id_conta = $1::bigint`,
      [idConta]
    );
    const conta = rows[0];

    await client.query("BEGIN");
    await client.query(
      `UPDATE public.contas SET id_assinatura = NULL WHERE id_conta = $1::bigint`,
      [idConta]
    );
    await registrarAudit(client, {
      tipo: "desvinculo_conta",
      id_cliente: idCliente,
      id_assinatura: conta?.id_assinatura ?? null,
      descricao: `Conta ${conta?.usuario ?? idConta} desvinculada (${conta?.nome_painel ?? "painel desconhecido"})`,
      dados_antes: { id_conta: idConta, usuario: conta?.usuario, id_assinatura: conta?.id_assinatura },
      dados_depois: { id_conta: idConta, usuario: conta?.usuario, id_assinatura: null },
    });
    await client.query("COMMIT");
    revalidatePath(`/clientes/${idCliente}`);
    return { ok: true };
  } catch (e) {
    await client.query("ROLLBACK");
    return { ok: false, erro: e instanceof Error ? e.message : "Erro ao desvincular." };
  } finally {
    client.release();
  }
}

export async function vincularContaExistente(
  idConta: string,
  idAssinatura: string,
  idCliente: string
): Promise<{ ok: boolean; erro?: string }> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      `SELECT c.usuario, ps.nome AS nome_painel
       FROM public.contas c
       LEFT JOIN public.painel_servidores ps ON ps.id = c.id_painel_servidor
       WHERE c.id_conta = $1::bigint`,
      [idConta]
    );
    const conta = rows[0];

    await client.query("BEGIN");
    await client.query(
      `UPDATE public.contas SET id_assinatura = $1::bigint WHERE id_conta = $2::bigint`,
      [idAssinatura, idConta]
    );
    await registrarAudit(client, {
      tipo: "vinculo_conta",
      id_cliente: idCliente,
      id_assinatura: idAssinatura,
      descricao: `Conta ${conta?.usuario ?? idConta} vinculada (${conta?.nome_painel ?? "painel desconhecido"})`,
      dados_antes: { id_conta: idConta, usuario: conta?.usuario, id_assinatura: null },
      dados_depois: { id_conta: idConta, usuario: conta?.usuario, id_assinatura: idAssinatura },
    });
    await client.query("COMMIT");
    revalidatePath(`/clientes/${idCliente}`);
    return { ok: true };
  } catch (e) {
    await client.query("ROLLBACK");
    return { ok: false, erro: e instanceof Error ? e.message : "Erro ao vincular." };
  } finally {
    client.release();
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
