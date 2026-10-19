// GET /api/assinaturas/[id]/forma-sugerida — forma do pagamento pro modal Renovar: INTER quando o Pix do comprovante
// recente está no extrato do Inter; senão a última outra conta do cliente (ou Outro) com aviso. Ver formaSugerida.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { formaSugerida } from "@/lib/pix-extrato";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  try {
    return NextResponse.json(await formaSugerida(Number(id)));
  } catch (err) {
    console.error("[forma-sugerida]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
