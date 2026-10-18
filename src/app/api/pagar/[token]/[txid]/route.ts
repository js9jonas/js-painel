// src/app/api/pagar/[token]/[txid]/route.ts — pública. A tela do cliente pergunta se o Pix já caiu.
import { NextRequest, NextResponse } from "next/server";
import { situacaoCobranca } from "@/lib/pix-link";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string; txid: string }> }) {
  const { token, txid } = await ctx.params;
  if (!/^[A-Za-z0-9]{26,35}$/.test(txid)) return NextResponse.json({ erro: "Cobrança não encontrada." }, { status: 404 });
  try {
    const cob = await situacaoCobranca(token, txid);
    if (!cob) return NextResponse.json({ erro: "Cobrança não encontrada." }, { status: 404 });
    return NextResponse.json({ pago: cob.pago_em !== null, expiraEm: cob.expira_em });
  } catch (err) {
    console.error("[pagar] falha ao consultar cobrança:", err instanceof Error ? err.message : err);
    return NextResponse.json({ pago: false }, { status: 500 });
  }
}
