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

  return NextResponse.json({
    ok: true,
    mensagem: `${inseridas} inseridas, ${atualizadas} atualizadas, ${removidas} removidas.`,
    total: contas.length,
    aviso: syncConfiavel ? null : "Sync com retorno insuficiente — remoções ignoradas por segurança.",
  });
}
