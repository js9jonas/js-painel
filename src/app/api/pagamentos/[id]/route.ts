// src/app/api/pagamentos/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const { rowCount } = await pool.query(
      `DELETE FROM public.pagamentos WHERE id = $1::bigint`,
      [id]
    );
    if (!rowCount) {
      return NextResponse.json({ ok: false, error: "Pagamento não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Erro ao excluir pagamento:", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Erro interno" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    // Aceita campos parciais — apenas os enviados são atualizados
    const campos: Record<string, unknown> = {};
    if (body.forma !== undefined) campos.forma = body.forma;

    const keys = Object.keys(campos);
    if (keys.length === 0) {
      return NextResponse.json({ ok: false, error: "Nenhum campo para atualizar" }, { status: 400 });
    }

    const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(", ");
    const values = [...keys.map((k) => campos[k]), id];

    const { rowCount } = await pool.query(
      `UPDATE public.pagamentos SET ${sets} WHERE id = $${keys.length + 1}::bigint`,
      values
    );

    if (!rowCount) {
      return NextResponse.json({ ok: false, error: "Pagamento não encontrado" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Erro ao atualizar pagamento:", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Erro interno" }, { status: 500 });
  }
}