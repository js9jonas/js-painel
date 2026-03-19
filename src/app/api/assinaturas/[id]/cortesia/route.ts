import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import { abaterCreditoRenovacao } from "@/lib/saldoServidor";

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await ctx.params;
    const idAssinatura = String(rawId).trim();

    const body = await req.json().catch(() => ({}));
    const dataManual = typeof body?.dataManual === "string" && body.dataManual.trim()
      ? body.dataManual.trim() : null;
    const vencContasManual = typeof body?.vencContasManual === "string" && body.vencContasManual.trim()
      ? body.vencContasManual.trim() : null;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const { rows: antes } = await client.query(
        `SELECT venc_contas::text AS venc_contas_anterior FROM public.assinaturas WHERE id_assinatura = $1::bigint`,
        [idAssinatura]
      );
      const vencContasAnterior = antes[0]?.venc_contas_anterior ?? null;

      const sql = `
        UPDATE public.assinaturas
        SET
          venc_contrato =
            CASE
              WHEN $2::date IS NOT NULL THEN $2::date
              ELSE (COALESCE(venc_contrato::date, CURRENT_DATE) + make_interval(months => 1))::date
            END,
          venc_contas =
            CASE
              WHEN $3::date IS NOT NULL THEN $3::date
              WHEN venc_contas IS NULL THEN (CURRENT_DATE + make_interval(months => 1))::date
              WHEN venc_contas::date >= CURRENT_DATE THEN (venc_contas::date + make_interval(months => 1))::date
              ELSE (CURRENT_DATE + make_interval(months => 1))::date
            END,
          atualizado_em = NOW()
        WHERE id_assinatura = $1::bigint
        RETURNING id_assinatura::text, venc_contrato::text, venc_contas::text, id_cliente::text;
      `;

      const result = await client.query(sql, [idAssinatura, dataManual, vencContasManual]);

      if (result.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ ok: false, error: "Assinatura não encontrada" }, { status: 404 });
      }

      const assinatura = result.rows[0];
      const vencContasNova = assinatura.venc_contas ?? null;

      // Abate crédito com observação de cortesia
      await abaterCreditoRenovacaoCortesia(client, idAssinatura, vencContasAnterior, vencContasNova);

      await client.query("COMMIT");
      return NextResponse.json({ ok: true, assinatura });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("Erro ao conceder cortesia:", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Erro interno" }, { status: 500 });
  }
}

// Igual ao abaterCreditoRenovacao mas com observacao diferente
async function abaterCreditoRenovacaoCortesia(
  client: any,
  idAssinatura: string,
  vencContasAnterior?: string | null,
  vencContasNova?: string | null
): Promise<void> {
  if (vencContasAnterior && vencContasNova) {
    const anterior = new Date(vencContasAnterior);
    const nova = new Date(vencContasNova);
    anterior.setHours(0, 0, 0, 0);
    nova.setHours(0, 0, 0, 0);
    const diffDias = Math.round((nova.getTime() - anterior.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDias < 15) return;
  }

  const { rows } = await client.query(
    `SELECT cs.id_servidor, cs.creditos_mensal
     FROM public.assinaturas a
     JOIN public.consumo_servidor cs ON cs.id_pacote = a.id_pacote
     WHERE a.id_assinatura = $1::bigint`,
    [idAssinatura]
  );
  if (rows.length === 0) return;

  const { id_servidor, creditos_mensal } = rows[0];

  await client.query(
    `INSERT INTO public.saldo_servidor (id_servidor, saldo_atual)
     VALUES ($1, 0) ON CONFLICT (id_servidor) DO NOTHING`,
    [id_servidor]
  );

  const { rows: saldoRows } = await client.query(
    `SELECT saldo_atual FROM public.saldo_servidor WHERE id_servidor = $1 FOR UPDATE`,
    [id_servidor]
  );

  const saldoAnterior = saldoRows[0]?.saldo_atual ?? 0;
  const saldoNovo = saldoAnterior - creditos_mensal;

  await client.query(
    `UPDATE public.saldo_servidor SET saldo_atual = $1, atualizado_em = NOW() WHERE id_servidor = $2`,
    [saldoNovo, id_servidor]
  );

  await client.query(
    `INSERT INTO public.saldo_servidor_historico
     (id_servidor, tipo, quantidade, saldo_anterior, saldo_novo, observacao, id_assinatura)
     VALUES ($1, 'abatimento', $2, $3, $4, 'Cortesia de indicacao', $5::bigint)`,
    [id_servidor, -creditos_mensal, saldoAnterior, saldoNovo, idAssinatura]
  );
}