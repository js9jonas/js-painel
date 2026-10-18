// src/lib/pix-webhook.ts — aviso de Pix recebido do Inter.
// A borda (Traefik) não valida o certificado do banco, então o aviso nunca é confiável por si:
// a URL leva um segredo (INTER_WEBHOOK_TOKEN) e cada txid é reconsultado no Inter antes de gravar.
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { confirmarCobranca } from "@/lib/pix-link";

function segredoConfere(recebido: string): boolean {
  const esperado = process.env.INTER_WEBHOOK_TOKEN?.trim();
  if (!esperado || esperado.length < 32) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function receberAvisoPix(req: NextRequest, segredo: string) {
  if (!segredoConfere(segredo)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const txids: string[] = Array.isArray(body?.pix)
    ? body.pix.map((p: { txid?: unknown }) => p?.txid).filter((t: unknown): t is string => typeof t === "string" && /^[A-Za-z0-9]{26,35}$/.test(t))
    : [];

  // Responde 200 mesmo se um txid falhar: o job de conferência pega depois. Erro aqui só faria
  // o Inter reenviar o lote inteiro.
  for (const txid of [...new Set(txids)].slice(0, 50)) {
    try {
      const r = await confirmarCobranca(txid);
      console.log(`[pix-webhook] ${txid}: ${r}`);
    } catch (err) {
      console.error(`[pix-webhook] ${txid} falhou:`, err instanceof Error ? err.message : err);
    }
  }
  return NextResponse.json({ ok: true });
}
