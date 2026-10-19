import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ids = body?.ids;

    console.log("marcar-ok chamado com ids:", ids);

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: "Nenhum id informado." }, { status: 400 });
    }

    await pool.query(
      // 'OK' em detalhes mantido por compatibilidade; a marca que vale é `conferencia` (sql/027).
      `UPDATE pagamentos SET conferencia = 'conferido', detalhes = 'OK' WHERE id = ANY($1::int[])`,
      [ids]
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Erro marcar-ok:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}