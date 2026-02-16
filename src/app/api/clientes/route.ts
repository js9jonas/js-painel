export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getClientes } from "@/lib/clientes";

export async function GET() {
  try {
    const rows = await getClientes();
    return NextResponse.json(rows);
  } catch (err: any) {
    console.error("ERRO /api/clientes:", err);
    return NextResponse.json(
      { error: "Falha ao buscar clientes", detail: err?.message || String(err) },
      { status: 500 }
    );
  }
}
