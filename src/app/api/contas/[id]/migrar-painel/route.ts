export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { migrarContaPainel } from "@/lib/migrar-painel";

// POST /api/contas/[id]/migrar-painel  body: { idPainelDestino: number }
// Migra a conta pra outro painel do mesmo tipo (ex: CLUB antigo → CLUB novo) — escolha manual
// de destino. Lógica compartilhada com a migração automática embutida em /renovar
// (ver src/lib/migrar-painel.ts).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const { id: idConta } = await params;
  const id = parseInt(idConta, 10);
  if (isNaN(id)) return NextResponse.json({ erro: "ID inválido." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const idPainelDestino = parseInt(body.idPainelDestino, 10);
  if (isNaN(idPainelDestino)) return NextResponse.json({ erro: "idPainelDestino inválido." }, { status: 400 });

  const resultado = await migrarContaPainel(id, idPainelDestino);
  if (!resultado.ok) {
    return NextResponse.json({ erro: resultado.erro }, { status: resultado.status });
  }
  return NextResponse.json({ ok: true, vencimento: resultado.vencimento });
}
