import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

type Periodo = "mensal" | "trimestral" | "semestral" | "anual";

function mesesDoPeriodo(p: Periodo) {
  switch (p) {
    case "trimestral":
      return 3;
    case "semestral":
      return 6;
    case "anual":
      return 12;
    default:
      return 1;
  }
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> } // 👈 params como Promise
) {
  try {
    const { id: rawId } = await ctx.params; // 👈 await aqui
    const idAssinatura = String(rawId).trim();

    const body = await req.json().catch(() => ({}));

    const periodo: Periodo = body?.periodo ?? "mensal";
    const meses = mesesDoPeriodo(periodo);

    const dataManual =
      typeof body?.dataManual === "string" && body.dataManual.trim()
        ? body.dataManual.trim()
        : null;

    const ativar = body?.ativar !== false;

const sql = `
  UPDATE public.assinaturas
  SET
    venc_contrato =
      CASE
        WHEN $2::date IS NOT NULL THEN $2::date
        ELSE (COALESCE(venc_contrato::date, CURRENT_DATE) + make_interval(months => $3))::date
      END,
    venc_contas =
      CASE
        WHEN venc_contas IS NULL THEN
          CASE
            WHEN $2::date IS NOT NULL THEN $2::date
            ELSE (COALESCE(venc_contrato::date, CURRENT_DATE) + make_interval(months => $3))::date
          END
        ELSE (venc_contas::date + make_interval(months => 1))::date
      END,
    status = CASE WHEN $4::boolean THEN 'ativo' ELSE status END,
    atualizado_em = NOW()
  WHERE id_assinatura = $1::bigint
  RETURNING id_assinatura::text AS id_assinatura, venc_contrato::text AS venc_contrato, venc_contas::text AS venc_contas, status;
`;
    const result = await pool.query(sql, [idAssinatura, dataManual, meses, ativar]);

    if (result.rowCount === 0) {
      return NextResponse.json(
        { ok: false, error: `Assinatura ${idAssinatura} não encontrada (rowCount=0)` },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, assinatura: result.rows[0] });
  } catch (err: any) {
    console.error("Erro ao renovar assinatura:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Erro interno" },
      { status: 500 }
    );
  }
}
