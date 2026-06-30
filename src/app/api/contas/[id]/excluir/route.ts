export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";
import { getAdapterPainel } from "@/lib/painel-adapters";

// POST /api/contas/[id]/excluir
// Exclui a conta no painel externo e marca removido_em localmente.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const { id: idConta } = await params;
  const id = parseInt(idConta, 10);
  if (isNaN(id)) return NextResponse.json({ erro: "ID inválido." }, { status: 400 });

  // Busca dados da conta
  const { rows } = await pool.query<{ usuario: string; id_painel_servidor: number | null }>(
    `SELECT usuario, id_painel_servidor FROM public.contas WHERE id_conta = $1 AND removido_em IS NULL`,
    [id]
  );
  if (!rows.length) return NextResponse.json({ erro: "Conta não encontrada." }, { status: 404 });

  const { usuario, id_painel_servidor } = rows[0];

  if (!id_painel_servidor) {
    return NextResponse.json({ erro: "Conta sem painel vinculado — não é possível excluir via API." }, { status: 422 });
  }

  // Tenta excluir no painel externo
  try {
    const adapter = await getAdapterPainel(id_painel_servidor);
    if (!adapter.deletarConta) {
      return NextResponse.json({ erro: "Exclusão via API não suportada para este tipo de painel." }, { status: 422 });
    }
    await adapter.deletarConta(usuario);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao excluir no painel.";
    return NextResponse.json({ erro: msg }, { status: 502 });
  }

  // Marca removido_em e remove vínculo com assinatura
  await pool.query(
    `UPDATE public.contas SET removido_em = NOW(), id_assinatura = NULL WHERE id_conta = $1`,
    [id]
  );

  return NextResponse.json({ ok: true });
}
