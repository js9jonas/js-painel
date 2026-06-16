export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getAdapterPainel } from "@/lib/painel-adapters";
import { pool } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idPainel = parseInt(id, 10);
  if (isNaN(idPainel)) return NextResponse.json({ erro: "ID inválido." }, { status: 400 });

  let usuario: string;
  try {
    const body = await req.json();
    usuario = body?.usuario;
  } catch {
    return NextResponse.json({ erro: "Body inválido." }, { status: 400 });
  }
  if (!usuario) return NextResponse.json({ erro: "Campo 'usuario' obrigatório." }, { status: 400 });

  let adapter;
  try {
    adapter = await getAdapterPainel(idPainel);
  } catch (e: unknown) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Adapter indisponível." }, { status: 400 });
  }

  try {
    const resultado = await adapter.renovar(usuario, 1);

    if (!resultado.ok) {
      return NextResponse.json({ erro: resultado.erro ?? "Falha ao renovar." }, { status: 502 });
    }

    if (resultado.novoVencimento) {
      await pool.query(
        `UPDATE public.contas
         SET vencimento_real_painel = $1, status_conta = 'ok'
         WHERE id_painel_servidor = $2 AND usuario = $3`,
        [resultado.novoVencimento, idPainel, usuario]
      );
    }

    return NextResponse.json({
      ok: true,
      novoVencimento: resultado.novoVencimento ?? null,
      mensagem: resultado.novoVencimento
        ? `Renovado até ${resultado.novoVencimento.split("-").reverse().join("/")}`
        : "Renovação solicitada com sucesso.",
    });
  } catch (e: unknown) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Erro ao renovar." }, { status: 502 });
  }
}
