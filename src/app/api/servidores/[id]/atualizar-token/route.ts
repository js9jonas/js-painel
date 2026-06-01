export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

// Rota legada: salva token de sessão em public.servidores (usada por rotas /api/servidores/*)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const idServidor = Number(id);
    const { token } = await req.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json({ error: "Token inválido." }, { status: 400 });
    }

    await pool.query(
      `UPDATE public.servidores
       SET session_cookie = $1, session_expiry = now() + interval '55 minutes'
       WHERE id_servidor = $2`,
      [token, idServidor]
    );

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
