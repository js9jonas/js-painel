export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { atualizarSessionPainelServidor } from "@/lib/paineis";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idPainel = parseInt(id, 10);
  if (isNaN(idPainel)) {
    return NextResponse.json({ erro: "ID inválido." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const token: string | undefined = body.token;

  if (!token || typeof token !== "string" || token.trim() === "") {
    return NextResponse.json({ erro: "Campo 'token' obrigatório." }, { status: 400 });
  }

  const expiryHours: number | undefined =
    typeof body.expiry_hours === "number" ? body.expiry_hours : undefined;

  await atualizarSessionPainelServidor(idPainel, token.trim(), expiryHours);

  return NextResponse.json({ ok: true, mensagem: "Token atualizado." });
}
