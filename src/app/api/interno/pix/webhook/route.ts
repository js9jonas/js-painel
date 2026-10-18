// src/app/api/interno/pix/webhook/route.ts — cadastra/consulta no Inter a URL do aviso de Pix.
// Uso único (ou ao trocar INTER_WEBHOOK_TOKEN): curl -X PUT com x-internal-token.
import { NextResponse } from "next/server";
import { configurarWebhook, consultarWebhook } from "@/lib/inter";
import { URL_PAINEL } from "@/lib/enderecos";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await consultarWebhook());
  } catch (err) {
    return NextResponse.json({ erro: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function PUT() {
  const segredo = process.env.INTER_WEBHOOK_TOKEN?.trim();
  if (!segredo || segredo.length < 32) {
    return NextResponse.json({ erro: "INTER_WEBHOOK_TOKEN ausente ou curto (mínimo 32 caracteres)" }, { status: 500 });
  }
  try {
    await configurarWebhook(`${URL_PAINEL}/api/inter/webhook/${segredo}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ erro: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
