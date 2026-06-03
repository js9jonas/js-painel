export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { getAdapterPainel } from "@/lib/painel-adapters";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idPainel = parseInt(id, 10);
  if (isNaN(idPainel)) {
    return NextResponse.json({ erro: "ID inválido." }, { status: 400 });
  }

  let adapter;
  try {
    adapter = await getAdapterPainel(idPainel);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro desconhecido.";
    return NextResponse.json({ erro: msg }, { status: 400 });
  }

  let contas;
  try {
    contas = await adapter.listarContas();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao buscar contas.";
    return NextResponse.json({ erro: msg }, { status: 502 });
  }

  // Guarda de segurança: se o retorno for vazio ou menor que 50% do que está ativo,
  // abortamos a etapa de remoção para não apagar dados por falha parcial da API.
  const { rows: countRows } = await pool.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM public.contas WHERE id_painel_servidor = $1 AND removido_em IS NULL`,
    [idPainel]
  );
  const totalAtivos = Number(countRows[0]?.total ?? 0);
  const syncConfiavel = contas.length > 0 && (totalAtivos === 0 || contas.length >= totalAtivos * 0.5);

  let inseridas = 0;
  let atualizadas = 0;

  for (const conta of contas) {
    const { rows } = await pool.query(
      `SELECT id_conta FROM public.contas WHERE id_painel_servidor = $1 AND usuario = $2`,
      [idPainel, conta.usuario]
    );

    if (rows.length === 0) {
      await pool.query(
        `INSERT INTO public.contas
           (id_painel_servidor, id_servidor, usuario, rotulo, vencimento_real_painel, status_conta, status_sinc, removido_em)
         VALUES ($1, $1, $2, $3, $4, $5, 'pendente', NULL)`,
        [idPainel, conta.usuario, conta.rotulo, conta.vencimento, conta.status]
      );
      inseridas++;
    } else {
      await pool.query(
        `UPDATE public.contas
         SET rotulo = $3, vencimento_real_painel = $4, status_conta = $5, removido_em = NULL
         WHERE id_painel_servidor = $1 AND usuario = $2`,
        [idPainel, conta.usuario, conta.rotulo, conta.vencimento, conta.status]
      );
      atualizadas++;
    }
  }

  let removidas = 0;
  if (syncConfiavel) {
    const usuarios = contas.map(c => c.usuario);
    const { rowCount } = await pool.query(
      `UPDATE public.contas
       SET removido_em = NOW()
       WHERE id_painel_servidor = $1
         AND usuario != ALL($2::text[])
         AND removido_em IS NULL`,
      [idPainel, usuarios]
    );
    removidas = rowCount ?? 0;
  }

  // Atualização automática de saldo — se o painel tiver id_servidor vinculado
  let saldoAtualizado = false;
  try {
    const { rows: painelRows } = await pool.query<{ id_servidor: number | null }>(
      `SELECT id_servidor FROM public.painel_servidores WHERE id = $1`,
      [idPainel]
    );
    const idServidor = painelRows[0]?.id_servidor ?? null;

    if (idServidor !== null) {
      const creditos = adapter.getCreditos ? await adapter.getCreditos() : null;
      if (creditos !== null) {
        const creditosInt = Math.round(creditos);
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          await client.query(
            `INSERT INTO public.saldo_servidor (id_servidor, saldo_atual)
             VALUES ($1, 0) ON CONFLICT (id_servidor) DO NOTHING`,
            [idServidor]
          );
          const { rows: saldoRows } = await client.query(
            `SELECT saldo_atual FROM public.saldo_servidor WHERE id_servidor = $1 FOR UPDATE`,
            [idServidor]
          );
          const saldoAnterior: number = saldoRows[0]?.saldo_atual ?? 0;
          const delta = creditosInt - saldoAnterior;
          await client.query(
            `UPDATE public.saldo_servidor SET saldo_atual = $1, atualizado_em = NOW() WHERE id_servidor = $2`,
            [creditosInt, idServidor]
          );
          await client.query(
            `INSERT INTO public.saldo_servidor_historico
               (id_servidor, tipo, quantidade, saldo_anterior, saldo_novo, observacao)
             VALUES ($1, 'ajuste', $2, $3, $4, 'Sync automático via painel')`,
            [idServidor, delta, saldoAnterior, creditosInt]
          );
          await client.query("COMMIT");
          saldoAtualizado = true;
        } catch {
          await client.query("ROLLBACK");
        } finally {
          client.release();
        }
      }
    }
  } catch {
    // Falha no saldo não interrompe o sync
  }

  return NextResponse.json({
    ok: true,
    mensagem: `${inseridas} inseridas, ${atualizadas} atualizadas, ${removidas} removidas.`,
    total: contas.length,
    saldo_atualizado: saldoAtualizado,
    aviso: syncConfiavel ? null : "Sync com retorno insuficiente — remoções ignoradas por segurança.",
  });
}
