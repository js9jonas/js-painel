// src/app/api/interno/pix/extrato/route.ts — o n8n ("Automações JS", junto do aviso da Alexa) manda aqui os
// Pix recebidos do dia sempre que aparece um novo. Header x-internal-token (liberado pelo proxy em /api/interno/).
// Grava em pix_extrato (sem duplicar) e analisa os que já esperaram o webhook do link. Modo sombra: não renova.
import { NextRequest, NextResponse } from "next/server";
import { analisarPixPendentes, ESPERA_ANALISE_MIN, registrarPixExtrato, type PixDoExtrato } from "@/lib/pix-extrato";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let lista: PixDoExtrato[];
  try {
    const body = await req.json();
    lista = Array.isArray(body?.pix) ? body.pix : [];
  } catch {
    return NextResponse.json({ erro: "Body inválido." }, { status: 400 });
  }
  if (lista.length > 500) return NextResponse.json({ erro: "Lista grande demais." }, { status: 400 });
  try {
    const r = await registrarPixExtrato(lista);
    const analisados = await analisarPixPendentes();
    // Pix com cobrança do link aberta ficou esperando o webhook: analisa assim que a espera vence, sem depender da
    // volta do job de 5 min (que continua como reserva se o painel reiniciar nesse meio-tempo).
    if (r.novos > 0) {
      setTimeout(() => {
        analisarPixPendentes().catch((err) =>
          console.error("[pix-extrato] análise agendada falhou:", err instanceof Error ? err.message : err));
      }, (ESPERA_ANALISE_MIN * 60 + 5) * 1000);
    }
    return NextResponse.json({ ok: true, ...r, analisados });
  } catch (err) {
    console.error("[pix-extrato] falha:", err instanceof Error ? err.message : err);
    return NextResponse.json({ erro: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
