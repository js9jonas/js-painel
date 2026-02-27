import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

type Periodo = "mensal" | "trimestral" | "semestral" | "anual";

function mesesDoPeriodo(p: Periodo) {
  switch (p) {
    case "trimestral": return 3;
    case "semestral": return 6;
    case "anual": return 12;
    default: return 1;
  }
}

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await ctx.params;
    const idAssinatura = String(rawId).trim();

    const body = await req.json().catch(() => ({}));

    const periodo: Periodo = body?.periodo ?? "mensal";
    const meses = mesesDoPeriodo(periodo);
    const dataManual = typeof body?.dataManual === "string" && body.dataManual.trim()
      ? body.dataManual.trim() : null;
    const ativar = body?.ativar !== false;
    const registrarPagamento = body?.registrarPagamento === true;
    const pgto = body?.pagamento ?? null;

    const client = await pool.connect();

    const vencContasManual = typeof body?.vencContasManual === "string" && body.vencContasManual.trim()
      ? body.vencContasManual.trim() : null;

    const soPagamento = body?.soPagamento === true;

    if (soPagamento) {
      try {
        await client.query("BEGIN");

        // Muda status para ativo se ativar=true
        await client.query(
          `UPDATE public.assinaturas SET status = 'ativo', atualizado_em = NOW() WHERE id_assinatura = $1::bigint`,
          [idAssinatura]
        );

        if (registrarPagamento && pgto) {
          const idCliente = pgto.idCliente;

          // Busca último pagamento para calcular dias
          const { rows: ultPgto } = await client.query(
            `SELECT data_pgto FROM public.pagamentos
           WHERE id_cliente = $1::bigint
           ORDER BY data_pgto DESC NULLS LAST LIMIT 1`,
            [idCliente]
          );

          let detalhes = "novo";
          if (ultPgto.length > 0 && ultPgto[0].data_pgto) {
            const ultimo = new Date(ultPgto[0].data_pgto);
            const hoje = new Date();
            ultimo.setHours(0, 0, 0, 0);
            hoje.setHours(0, 0, 0, 0);
            const dias = Math.round((hoje.getTime() - ultimo.getTime()) / (1000 * 60 * 60 * 24));
            detalhes = `${dias} dias desde o último pagamento`;
          }

          await client.query(
            `INSERT INTO public.pagamentos
             (id_cliente, cliente, compra, data_pgto, forma, valor, detalhes, tipo, atualizado_em)
           VALUES ($1::bigint, $2, $3, CURRENT_DATE, $4, $5::numeric, $6, 'Assinatura tv', NOW())`,
            [
              idCliente,
              pgto.nomeCliente ?? null,
              pgto.pacoteNome ?? null,
              pgto.forma ?? "PIX",
              pgto.valor ?? 0,
              detalhes,
            ]
          );
        }


        await client.query("COMMIT");
        return NextResponse.json({ ok: true });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }
    try {
      await client.query("BEGIN");

      const sql = `
  UPDATE public.assinaturas
  SET
    venc_contrato =
  CASE
    WHEN $2::date IS NOT NULL THEN $2::date
    WHEN venc_contrato::date >= CURRENT_DATE
      THEN (COALESCE(venc_contrato::date, CURRENT_DATE) + make_interval(months => $3))::date
    ELSE (CURRENT_DATE + make_interval(months => $3))::date
  END,
venc_contas =
  CASE
    WHEN $5::date IS NOT NULL THEN $5::date
    WHEN venc_contas IS NULL THEN (CURRENT_DATE + make_interval(months => 1))::date
    WHEN venc_contas::date >= CURRENT_DATE THEN (venc_contas::date + make_interval(months => 1))::date
    ELSE (CURRENT_DATE + make_interval(months => 1))::date
  END,
    status = CASE WHEN $4::boolean THEN 'ativo' ELSE status END,
    atualizado_em = NOW()
  WHERE id_assinatura = $1::bigint
  RETURNING id_assinatura::text, venc_contrato::text, venc_contas::text, status, id_cliente::text;
`;

      const result = await client.query(sql, [idAssinatura, dataManual, meses, ativar, vencContasManual]);

      if (result.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: `Assinatura ${idAssinatura} não encontrada` }, { status: 404 });
      }

      const assinatura = result.rows[0];


      await client.query("COMMIT");
      return NextResponse.json({ ok: true, assinatura });

    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

  } catch (err: any) {
    console.error("Erro ao renovar assinatura:", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Erro interno" }, { status: 500 });
  }
}