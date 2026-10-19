// GET /api/assinaturas/[id]/pagamentos-recentes — pagamentos dos últimos dias da assinatura, pro modal Renovar
// avisar quando ela já foi renovada (link Pix automático, extrato conclusivo ou à mão) antes de renovar de novo.
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";

const DIAS = 3;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  try {
    const { rows } = await pool.query(
      `SELECT id, data_pgto::text, valor::text, forma, conferencia, pagador,
              to_char(atualizado_em, 'DD/MM HH24:MI') AS registrado_em
         FROM public.pagamentos
        WHERE id_assinatura = $1::bigint AND data_pgto >= CURRENT_DATE - $2::int
        ORDER BY data_pgto DESC, id DESC`,
      [id, DIAS]
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[pagamentos-recentes]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
