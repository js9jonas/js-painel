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
           (id_painel_servidor, id_servidor, usuario, rotulo, vencimento_real_painel, status_conta, status_sinc)
         VALUES ($1, $1, $2, $3, $4, $5, 'pendente')`,
        [idPainel, conta.usuario, conta.rotulo, conta.vencimento, conta.status]
      );
      inseridas++;
    } else {
      await pool.query(
        `UPDATE public.contas
         SET rotulo = $3, vencimento_real_painel = $4, status_conta = $5
         WHERE id_painel_servidor = $1 AND usuario = $2`,
        [idPainel, conta.usuario, conta.rotulo, conta.vencimento, conta.status]
      );
      atualizadas++;
    }
  }

  return NextResponse.json({
    ok: true,
    mensagem: `${inseridas} inseridas, ${atualizadas} atualizadas.`,
    total: contas.length,
  });
}
