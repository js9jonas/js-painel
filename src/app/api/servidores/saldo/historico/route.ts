// src/app/api/servidores/saldo/historico/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getHistoricoSaldo } from "@/lib/saldoServidor";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id_servidor = searchParams.get("id_servidor");
  const limite = Number(searchParams.get("limite") ?? "15");

  if (!id_servidor) {
    return NextResponse.json({ ok: false, error: "id_servidor obrigatório" }, { status: 400 });
  }

  const historico = await getHistoricoSaldo(id_servidor, limite);
  return NextResponse.json({ ok: true, historico });
}