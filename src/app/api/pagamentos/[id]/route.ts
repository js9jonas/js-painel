// src/app/api/pagamentos/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { registrarAudit, origemRequisicao } from "@/lib/audit";

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `DELETE FROM public.pagamentos WHERE id = $1::bigint
         RETURNING id::text, id_cliente::text, id_assinatura::text, data_pgto::text,
                   valor::text, forma, tipo_pagamento`,
        [id]
      );
      if (rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: "Pagamento não encontrado" }, { status: 404 });
      }
      const pg = rows[0];
      await registrarAudit(client, {
        tipo: "exclusao_pagamento",
        id_cliente: pg.id_cliente,
        id_assinatura: pg.id_assinatura,
        descricao: `Pagamento #${pg.id} excluído (R$ ${pg.valor}, ${pg.forma ?? "—"})`,
        dados_antes: {
          id_pagamento: pg.id,
          data_pgto: pg.data_pgto,
          valor: pg.valor,
          forma: pg.forma,
          tipo_pagamento: pg.tipo_pagamento,
        },
        dados_depois: origemRequisicao(req),
      });
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
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