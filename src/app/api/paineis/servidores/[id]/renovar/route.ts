export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { renovarContaNoPainel } from "@/lib/renovar-conta-painel";

// Lógica em src/lib/renovar-conta-painel.ts (mesma usada pela renovação automática do Pix).
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

  const r = await renovarContaNoPainel(idPainel, usuario);
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: r.status });
  return NextResponse.json({
    ok: true,
    ...(r.migrado ? { migrado: true } : {}),
    novoVencimento: r.novoVencimento,
    mensagem: r.mensagem,
  });
}
