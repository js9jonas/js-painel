export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getAdapterPainel } from "@/lib/painel-adapters";
import { pool } from "@/lib/db";
import { registrarAudit } from "@/lib/audit";
import type { PoolClient } from "pg";
import type { PainelAdapter } from "@/lib/painel-adapters/types";

// /alertas: contrato acaba antes de 1 mês → em vez de renovar o mês, soma só os dias até o fim do contrato
// (FAST e Central, pelo robô de navegador). Os dias são calculados AQUI (venc_contrato − vencimento lido na hora
// no painel, dentro do adapter), nunca vindos da tela: aba velha ou toque duplo não somam dias a mais.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idPainel = parseInt(id, 10);
  if (isNaN(idPainel)) return NextResponse.json({ erro: "ID inválido." }, { status: 400 });

  const body = await req.json().catch(() => null);
  const usuario: string | undefined = body?.usuario;
  if (!usuario) return NextResponse.json({ erro: "Campo 'usuario' obrigatório." }, { status: 400 });

  const { rows } = await pool.query<{ id_conta: string; id_cliente: string | null; id_assinatura: string | null; venc_contrato: string | null }>(
    `SELECT ct.id_conta::text, a.id_cliente::text, a.id_assinatura::text, a.venc_contrato::date::text AS venc_contrato
       FROM public.contas ct
       LEFT JOIN public.assinaturas a ON a.id_assinatura = ct.id_assinatura
      WHERE ct.id_painel_servidor = $1 AND ct.usuario = $2 AND ct.removido_em IS NULL
      LIMIT 1`,
    [idPainel, usuario]
  );
  const conta = rows[0];
  if (!conta) return NextResponse.json({ erro: `Conta "${usuario}" não encontrada neste painel.` }, { status: 404 });
  const vencContrato = conta.venc_contrato;
  if (!vencContrato) return NextResponse.json({ erro: "A assinatura desta conta não tem fim de contrato." }, { status: 422 });

  let adapter;
  try {
    adapter = await getAdapterPainel(idPainel);
  } catch (e: unknown) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Adapter indisponível." }, { status: 400 });
  }
  if (typeof adapter.adicionarDiasAte !== "function") {
    return NextResponse.json({ erro: "Este painel não tem a opção de adicionar dias." }, { status: 422 });
  }

  // Trava por conta enquanto o robô trabalha (até ~90 s): dois cliques em abas diferentes leriam o mesmo
  // vencimento e somariam os dias duas vezes. Conexão dedicada, segura até o fim.
  const client = await pool.connect();
  const chave = `adicionar-dias:${conta.id_conta}`;
  try {
    const { rows: trava } = await client.query<{ ok: boolean }>(`SELECT pg_try_advisory_lock(hashtext($1)) AS ok`, [chave]);
    if (!trava[0]?.ok) return NextResponse.json({ erro: "Já tem um pedido de dias em andamento para esta conta. Aguarde." }, { status: 409 });
    try {
      return await executar(client, adapter.adicionarDiasAte.bind(adapter), { ...conta, venc_contrato: vencContrato }, usuario);
    } finally {
      await client.query(`SELECT pg_advisory_unlock(hashtext($1))`, [chave]).catch(() => {});
    }
  } finally {
    client.release();
  }
}

async function executar(
  client: PoolClient,
  adicionarDiasAte: NonNullable<PainelAdapter["adicionarDiasAte"]>,
  conta: { id_conta: string; id_cliente: string | null; id_assinatura: string | null; venc_contrato: string },
  usuario: string
) {
  const resultado = await adicionarDiasAte(usuario, conta.venc_contrato).catch((e: unknown) => ({
    ok: false as const, erro: e instanceof Error ? e.message : "Erro ao adicionar dias.",
    novoVencimento: undefined as string | undefined, antes: undefined as string | undefined, dias: undefined as number | undefined,
  }));
  if (!resultado.ok) return NextResponse.json({ erro: resultado.erro ?? "Falha ao adicionar dias." }, { status: 422 });
  const dias = resultado.dias ?? 0;
  const ate = resultado.novoVencimento?.split("-").reverse().join("/");
  if (dias === 0) {
    // Nada somado, mas o banco pode estar atrasado até o próximo sync: acerta a data lida no painel
    if (resultado.novoVencimento) {
      await client.query(`UPDATE public.contas SET vencimento_real_painel = $1 WHERE id_conta = $2::bigint`, [resultado.novoVencimento, conta.id_conta]);
    }
    return NextResponse.json({ ok: true, novoVencimento: resultado.novoVencimento, mensagem: `Já vale até o fim do contrato (${ate}): nenhum dia adicionado.` });
  }

  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE public.contas SET vencimento_real_painel = $1, status_conta = 'ok' WHERE id_conta = $2::bigint`,
      [resultado.novoVencimento, conta.id_conta]
    );
    await registrarAudit(client, {
      tipo: "renovacao",
      id_cliente: conta.id_cliente,
      id_assinatura: conta.id_assinatura,
      descricao: `Conta ${usuario}: +${dias} dia(s) no painel até o fim do contrato`,
      dados_antes: { usuario, vencimento_painel: resultado.antes ?? null },
      dados_depois: { usuario, vencimento_painel: resultado.novoVencimento, dias },
    });
    await client.query("COMMIT");
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    // O painel já mudou: só o registro local falhou — avisa em vez de esconder
    return NextResponse.json({
      ok: true,
      novoVencimento: resultado.novoVencimento,
      mensagem: `Dias adicionados no painel (até ${ate}), mas não deu para gravar aqui: rode o Sync do painel.`,
    });
  }

  return NextResponse.json({
    ok: true,
    novoVencimento: resultado.novoVencimento,
    mensagem: `+${dias} dia(s) — válido até ${ate}`,
  });
}
