export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { migrarHost } from "@/lib/migrar-host";

// Migração em massa de endereço (IBO Pro e SmartOne): troca o endereço do servidor em todas as listas da
// revenda. POST { antigo, novo, confirmado: true }. Ver src/lib/migrar-host.ts.

const HOST_RE = /^https?:\/\/[A-Za-z0-9.-]+(:\d+)?$/;
const normalizar = (h: unknown) => String(h ?? "").trim().replace(/\/+$/, "");

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const corpo = await req.json().catch(() => ({}));
  const antigo = normalizar(corpo?.antigo);
  const novo = normalizar(corpo?.novo);
  if (!HOST_RE.test(antigo) || !HOST_RE.test(novo)) {
    return NextResponse.json({ erro: "Endereço inválido. Use o formato http://dominio.com (com :porta se tiver)." }, { status: 400 });
  }
  if (antigo.toLowerCase() === novo.toLowerCase()) return NextResponse.json({ erro: "Os dois endereços são iguais." }, { status: 400 });
  if (corpo?.confirmado !== true) return NextResponse.json({ erro: "Confirme a migração." }, { status: 400 });
  const idPainel = parseInt((await params).id, 10);
  if (isNaN(idPainel)) return NextResponse.json({ erro: "ID inválido." }, { status: 400 });
  try {
    const r = await migrarHost(idPainel, antigo, novo);
    return NextResponse.json({ ok: true, ...r });
  } catch (e: unknown) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "O painel recusou a migração." }, { status: 422 });
  }
}
