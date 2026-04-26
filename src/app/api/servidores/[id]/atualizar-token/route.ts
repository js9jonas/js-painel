export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { atualizarTokenCentral } from "@/lib/painel-adapters/central";

// Rota para salvar manualmente o JWT do CENTRAL (expira em 1h).
// Jonas abre painel.fun → DevTools → Application → Local Storage → session-store → state.token
// Então chama: POST /api/servidores/2/atualizar-token  { "token": "eyJ..." }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const idServidor = Number(id);
    const { token } = await req.json();

    if (!token || typeof token !== "string" || !token.startsWith("eyJ")) {
      return NextResponse.json({ error: "Token JWT inválido." }, { status: 400 });
    }

    await atualizarTokenCentral(idServidor, token);
    return NextResponse.json({ ok: true, expira: new Date(Date.now() + 55 * 60 * 1000).toISOString() });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
