import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json();
    const observacao =
      typeof body?.observacao === "string" ? body.observacao : null;

    await pool.query(
      `
      UPDATE clientes
      SET observacao = $1
      WHERE id_cliente::text = $2
      `,
      [observacao, id]
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    // Ajuda MUITO a enxergar erro de coluna/tipo
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Erro desconhecido" },
      { status: 500 }
    );
  }
}
