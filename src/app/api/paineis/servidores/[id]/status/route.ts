export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getAdapterPainel } from "@/lib/painel-adapters";

export async function GET(
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
    return NextResponse.json({ erro: msg, conectado: false }, { status: 400 });
  }

  try {
    const [contas, creditos] = await Promise.allSettled([
      adapter.listarContas(),
      adapter.getCreditos?.() ?? Promise.resolve(null),
    ]);

    if (contas.status === "rejected") {
      throw contas.reason;
    }

    const lista = contas.value;
    const ativas    = lista.filter((c) => c.status === "ok").length;
    const vencidas  = lista.filter((c) => c.status === "vencida").length;
    const bloqueadas = lista.filter((c) => c.status === "bloqueada").length;

    return NextResponse.json({
      conectado: true,
      total: lista.length,
      ativas,
      vencidas,
      bloqueadas,
      creditos: creditos.status === "fulfilled" ? creditos.value : null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao conectar.";
    return NextResponse.json({ erro: msg, conectado: false }, { status: 502 });
  }
}
