// src/app/api/pagar/[token]/route.ts — pública (o token do link é a autorização).
// POST { assinaturas: ({ id, meses } | string)[] } → cria ou reaproveita a cobrança Pix das assinaturas escolhidas.
import { NextRequest, NextResponse } from "next/server";
import { gerarCobranca, qrSvg, ErroLink, type EscolhaLink } from "@/lib/pix-link";
import { ErroInter } from "@/lib/inter";

export const runtime = "nodejs";

// Erros saem como 500, nunca 502/503/504: o Easypanel troca essas respostas pela página
// "Service is not reachable" e o cliente perderia a mensagem (visto em 18/10/2026).

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const body = await req.json().catch(() => null);
  // Cada item: "123" (formato antigo, período do plano atual) ou { id: "123", meses: 3 } (19/10/2026)
  const escolhas: EscolhaLink[] = Array.isArray(body?.assinaturas)
    ? body.assinaturas
        .map((x: unknown): EscolhaLink => {
          if (x && typeof x === "object") {
            const o = x as { id?: unknown; meses?: unknown };
            const meses = Number(o.meses);
            return { id: String(o.id ?? ""), meses: Number.isInteger(meses) && meses > 0 ? meses : undefined };
          }
          return { id: String(x) };
        })
        .filter((e: EscolhaLink) => /^\d{1,18}$/.test(e.id))
        .slice(0, 20)
    : [];

  try {
    const cob = await gerarCobranca(token, escolhas);
    return NextResponse.json({
      txid: cob.txid,
      valor: cob.valor,
      pixCopiaECola: cob.pix_copia_cola,
      expiraEm: cob.expira_em,
      assinaturas: cob.assinaturas,
      itens: cob.itens,
      qrSvg: await qrSvg(cob.pix_copia_cola),
    });
  } catch (err) {
    if (err instanceof ErroLink) return NextResponse.json({ erro: err.message }, { status: err.status });
    console.error("[pagar] falha ao gerar cobrança:", err instanceof Error ? err.message : err);
    const msg = err instanceof ErroInter
      ? "O banco não respondeu agora. Tente de novo em alguns minutos."
      : "Não deu certo agora. Tente de novo em alguns minutos.";
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
