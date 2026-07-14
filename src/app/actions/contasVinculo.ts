"use server";

import { pool } from "@/lib/db";
import { registrarAudit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { getAdapterPainel } from "@/lib/painel-adapters";

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

export type ResultadoCriarTeste = {
  ok: boolean;
  erro?: string;
  usuario?: string;
  senha?: string;
  expiracao?: string;
  expiracaoHorario?: string;
};

export async function criarContaTeste(
  idPainelServidor: number,
  idCliente: string,
  idAssinatura: string,
  descricao: string
): Promise<ResultadoCriarTeste> {
  const { rows: clienteRows } = await pool.query(
    `SELECT nome FROM public.clientes WHERE id_cliente = $1::bigint`,
    [idCliente]
  );
  const nomeCliente = clienteRows[0]?.nome;
  if (!nomeCliente) return { ok: false, erro: "Cliente não encontrado." };

  let adapter;
  try {
    adapter = await getAdapterPainel(idPainelServidor);
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Painel não encontrado." };
  }

  if (!adapter.gerarTeste) {
    return { ok: false, erro: "Este painel não suporta geração de teste." };
  }

  const rotulo = `${nomeCliente} - ${descricao}`.trim();

  let resultado;
  try {
    resultado = await adapter.gerarTeste({ rotulo });
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "Erro ao gerar teste no painel." };
  }

  if (!resultado.ok) {
    return { ok: false, erro: resultado.erro ?? "Falha ao gerar teste no painel." };
  }

  const client = await pool.connect();
  try {
    const { rows: painelMeta } = await client.query<{ id_servidor: number | null }>(
      `SELECT id_servidor FROM public.painel_servidores WHERE id = $1`,
      [idPainelServidor]
    );
    const idServidor = painelMeta[0]?.id_servidor ?? idPainelServidor;

    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO public.contas
         (id_painel_servidor, id_servidor, id_assinatura, usuario, senha, rotulo, vencimento_real_painel, status_conta, status_sinc)
       VALUES ($1, $2, $3::bigint, $4, $5, $6, $7, 'ok', 'confirmado')
       RETURNING id_conta::text`,
      [idPainelServidor, idServidor, idAssinatura, resultado.usuario, resultado.senha ?? null, rotulo, resultado.expiracao ?? null]
    );
    const idConta = rows[0].id_conta;

    await registrarAudit(client, {
      tipo: "criacao_teste_conta",
      id_cliente: idCliente,
      id_assinatura: idAssinatura,
      descricao: `Teste criado (${resultado.usuario}) — ${descricao}`,
      dados_depois: { id_conta: idConta, usuario: resultado.usuario, id_painel_servidor: idPainelServidor },
    });
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    return { ok: false, erro: e instanceof Error ? e.message : "Erro ao salvar conta de teste." };
  } finally {
    client.release();
  }

  revalidatePath(`/clientes/${idCliente}`);
  return {
    ok: true,
    usuario: resultado.usuario,
    senha: resultado.senha,
    expiracao: resultado.expiracao,
    expiracaoHorario: resultado.expiracaoHorario,
  };
}
