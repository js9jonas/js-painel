export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getAdapterPainel } from "@/lib/painel-adapters";

const TIMEOUT_MS = 12_000;

function comTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout após ${ms / 1000}s`)), ms)
    ),
  ]);
}

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

  const [contas, creditos] = await Promise.allSettled([
    comTimeout(adapter.listarContas(), TIMEOUT_MS),
    comTimeout(adapter.getCreditos?.() ?? Promise.resolve(null), TIMEOUT_MS),
  ]);

  if (contas.status === "rejected") {
    const msg = contas.reason instanceof Error ? contas.reason.message : "Erro ao conectar.";
    return NextResponse.json({ erro: msg, conectado: false });
  }

  const lista = contas.value;
  return NextResponse.json({
    conectado: true,
    total: lista.length,
    ativas:     lista.filter((c) => c.status === "ok").length,
    vencidas:   lista.filter((c) => c.status === "vencida").length,
    bloqueadas: lista.filter((c) => c.status === "bloqueada").length,
    creditos:   creditos.status === "fulfilled" ? creditos.value : null,
  });
}
