export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getAdapter } from "@/lib/painel-adapters";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const idServidor = Number(params.id);
    const { usuario, meses = 1 } = await req.json();

    if (!usuario) {
      return NextResponse.json({ ok: false, error: "Campo obrigatório: usuario" }, { status: 400 });
    }

    const adapter = await getAdapter(idServidor);
    const resultado = await adapter.renovar(usuario, meses);

    if (!resultado.ok) {
      return NextResponse.json({ ok: false, error: resultado.erro }, { status: 422 });
    }

    const { ok: _ok, erro: _erro, ...rest } = resultado;
    return NextResponse.json({ ok: true, ...rest });
  } catch (err: any) {
    console.error("Erro ao renovar conta:", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Erro interno" }, { status: 500 });
  }
}
