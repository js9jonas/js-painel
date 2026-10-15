export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

// Resultado de uma tarefa do robô de navegador (ver /api/interno/robo/proxima e src/lib/robo.ts).
export async function POST(req: NextRequest) {
  const corpo = (await req.json().catch(() => ({}))) as { id?: number; ok?: boolean; resultado?: unknown; erro?: string };
  if (!corpo.id) return NextResponse.json({ erro: "Informe o id." }, { status: 400 });
  const { rowCount } = await pool.query(
    `UPDATE public.robo_tarefas SET status = $2, resultado = $3, erro = $4, concluido_em = NOW()
     WHERE id = $1 AND status = 'executando'`,
    [corpo.id, corpo.ok ? "ok" : "erro", corpo.resultado == null ? null : JSON.stringify(corpo.resultado), corpo.ok ? null : (corpo.erro ?? "Erro sem mensagem.")]
  );
  return NextResponse.json({ ok: (rowCount ?? 0) > 0 });
}
