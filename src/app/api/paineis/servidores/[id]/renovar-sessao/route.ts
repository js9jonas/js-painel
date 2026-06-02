export const runtime = "nodejs";
export const maxDuration = 600; // 10 minutos — necessário para 2captcha resolver hCaptcha

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { loginClub } from "@/lib/painel-adapters/club";
import type { ServidorCredenciais, SaveSession } from "@/lib/painel-adapters/types";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idPainel = parseInt(id, 10);
  if (isNaN(idPainel)) {
    return NextResponse.json({ erro: "ID inválido." }, { status: 400 });
  }

  const { rows } = await pool.query<ServidorCredenciais & { painel_tipo: string }>(
    `SELECT tipo AS painel_tipo, usuario AS painel_usuario, senha AS painel_senha,
            session_cookie, session_expiry, api_token, api_secret
     FROM public.painel_servidores WHERE id = $1`,
    [idPainel]
  );

  if (!rows.length) {
    return NextResponse.json({ erro: "Painel não encontrado." }, { status: 404 });
  }

  const creds = rows[0] as unknown as ServidorCredenciais & { painel_tipo: string };

  if (creds.painel_tipo !== "club") {
    return NextResponse.json({ erro: "Este endpoint é exclusivo para o CLUB." }, { status: 400 });
  }

  const onSaveSession: SaveSession = async (cookie, expiry) => {
    await pool.query(
      `UPDATE public.painel_servidores SET session_cookie = $1, session_expiry = $2 WHERE id = $3`,
      [cookie, expiry ?? null, idPainel]
    );
  };

  try {
    const token = await loginClub(creds, onSaveSession);
    return NextResponse.json({ ok: true, tokenPreview: token.substring(0, 20) + "..." });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ ok: false, erro: msg }, { status: 502 });
  }
}
