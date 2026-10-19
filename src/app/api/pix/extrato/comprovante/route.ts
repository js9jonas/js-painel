// GET /api/pix/extrato/comprovante?id_msg=N — conclusão do modo sombra pra um balão "RESUMO GERADO POR IA"
// do /chat (src/lib/pix-extrato.ts). Só leitura; a renovação continua manual nesta etapa.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { conclusaoDoComprovante } from "@/lib/pix-extrato";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  const idMsg = Number(req.nextUrl.searchParams.get("id_msg"));
  if (!Number.isInteger(idMsg) || idMsg <= 0) return NextResponse.json({ erro: "id_msg inválido" }, { status: 400 });
  try {
    const r = await conclusaoDoComprovante(idMsg);
    if (!r) return NextResponse.json({ erro: "Mensagem não é um resumo de comprovante" }, { status: 404 });
    return NextResponse.json(r);
  } catch (err) {
    console.error("[pix-extrato] conclusão do comprovante falhou:", err instanceof Error ? err.message : err);
    return NextResponse.json({ erro: "Erro interno" }, { status: 500 });
  }
}
