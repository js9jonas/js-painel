"use server";

import { pool } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { registrarAudit } from "@/lib/audit";

export async function updateCliente(
  id: string,
  data: {
    nome: string;
    observacao: string | null;
    observacao_assinatura?: string | null;
    id_assinatura?: string | null;
  }
) {
  if (!data.nome.trim()) throw new Error("Nome é obrigatório");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: antes } = await client.query(
      `SELECT nome, observacao FROM public.clientes WHERE id_cliente = $1::bigint`,
      [id]
    );
    const ant = antes[0];

    await client.query(
      `UPDATE public.clientes SET nome = $1, observacao = $2 WHERE id_cliente = $3::bigint`,
      [data.nome.trim(), data.observacao?.trim() || null, id]
    );

    if (ant) {
      const camposAlterados: Record<string, { antes: string | null; depois: string | null }> = {};

      if (ant.nome !== data.nome.trim()) {
        camposAlterados.nome = { antes: ant.nome, depois: data.nome.trim() };
      }
      if ((ant.observacao ?? null) !== (data.observacao?.trim() || null)) {
        camposAlterados.observacao = { antes: ant.observacao, depois: data.observacao?.trim() || null };
      }

      if (Object.keys(camposAlterados).length > 0) {
        await registrarAudit(client, {
          tipo: "edicao_cadastro",
          id_cliente: id,
          descricao: `Campos alterados: ${Object.keys(camposAlterados).join(", ")}`,
          dados_antes:  Object.fromEntries(Object.entries(camposAlterados).map(([k, v]) => [k, v.antes])),
          dados_depois: Object.fromEntries(Object.entries(camposAlterados).map(([k, v]) => [k, v.depois])),
        });
      }
    }

    if (data.id_assinatura) {
      await client.query(
        `UPDATE public.assinaturas SET observacao = $1, atualizado_em = NOW() WHERE id_assinatura = $2::bigint`,
        [data.observacao_assinatura?.trim() || null, data.id_assinatura]
      );
    }

    await client.query("COMMIT");
    revalidatePath("/clientes");
    revalidatePath(`/clientes/${id}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export type ContatoRow = {
  id_contato: string;
  telefone: string;
  nome: string | null;
  referencia: string | null;
};

export async function getContatosCliente(idCliente: string): Promise<ContatoRow[]> {
  const { rows } = await pool.query<ContatoRow>(
    `SELECT id_contato::text, telefone, nome, referencia
     FROM public.contatos
     WHERE id_cliente = $1::bigint
     ORDER BY criado_em ASC`,
    [idCliente]
  );
  return rows;
}

export async function salvarContato(
  idCliente: string,
  data: { idContato?: string; telefone: string; nome: string | null; referencia: string | null }
): Promise<void> {
  if (data.idContato) {
    await pool.query(
      `UPDATE public.contatos
       SET telefone = $1, nome = $2, referencia = $3, atualizado_em = NOW()
       WHERE id_contato = $4::bigint`,
      [data.telefone.trim(), data.nome?.trim() || null, data.referencia?.trim() || null, data.idContato]
    );
  } else {
    await pool.query(
      `INSERT INTO public.contatos (id_cliente, telefone, nome, referencia, criado_em, atualizado_em)
       VALUES ($1::bigint, $2, $3, $4, NOW(), NOW())`,
      [idCliente, data.telefone.trim(), data.nome?.trim() || null, data.referencia?.trim() || null]
    );
  }
  revalidatePath(`/clientes/${idCliente}`);
}

export async function deletarContato(idContato: string, idCliente: string): Promise<void> {
  await pool.query(
    `DELETE FROM public.contatos WHERE id_contato = $1::bigint`,
    [idContato]
  );
  revalidatePath(`/clientes/${idCliente}`);
}