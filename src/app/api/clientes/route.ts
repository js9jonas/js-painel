export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { getClientes } from "@/lib/clientes";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl;
    const q = searchParams.get("q") ?? undefined;
    const limit = Math.min(Number(searchParams.get("limit") ?? 20), 50);

    const rows = await getClientes({ q, pageSize: limit, page: 1 });
    return NextResponse.json(rows);
  } catch (err: any) {
    console.error("ERRO /api/clientes:", err);
    return NextResponse.json(
      { error: "Falha ao buscar clientes", detail: err?.message || String(err) },
      { status: 500 }
    );
  }
}
