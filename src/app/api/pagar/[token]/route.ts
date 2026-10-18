// src/app/api/pagar/[token]/route.ts — pública (o token do link é a autorização).
// POST { assinaturas: string[] } → cria ou reaproveita a cobrança Pix das assinaturas escolhidas.
import { NextRequest, NextResponse } from "next/server";
import { gerarCobranca, qrSvg, ErroLink } from "@/lib/pix-link";
import { ErroInter } from "@/lib/inter";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const body = await req.json().catch(() => null);
  const ids = Array.isArray(body?.assinaturas)
    ? body.assinaturas.map((x: unknown) => String(x)).filter((x: string) => /^\d{1,18}$/.test(x)).slice(0, 20)
    : [];

  try {
    const cob = await gerarCobranca(token, ids);
    return NextResponse.json({
      txid: cob.txid,
      valor: cob.valor,
      pixCopiaECola: cob.pix_copia_cola,
      expiraEm: cob.expira_em,
      assinaturas: cob.assinaturas,
      qrSvg: await qrSvg(cob.pix_copia_cola),
    });
  } catch (err) {
    if (err instanceof ErroLink) return NextResponse.json({ erro: err.message }, { status: err.status });
    console.error("[pagar] falha ao gerar cobrança:", err instanceof Error ? err.message : err);
    const msg = err instanceof ErroInter
      ? "O banco não respondeu agora. Tente de novo em alguns minutos."
      : "Não deu certo agora. Tente de novo em alguns minutos.";
    return NextResponse.json({ erro: msg }, { status: 502 });
  }
}
