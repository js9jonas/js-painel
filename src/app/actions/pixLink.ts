"use server";
// src/app/actions/pixLink.ts — tirar de /alertas um Pix pelo link sem renovar (ex.: devolvido, pago em dobro).
import { revalidatePath } from "next/cache";
import { pool } from "@/lib/db";
import { requireAuth } from "@/lib/checkRole";
import { registrarAudit } from "@/lib/audit";

export async function dispensarPixLink(
  idCobranca: string,
  idAssinatura: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireAuth();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id_cliente: string; valor: string; txid: string }>(
      `UPDATE public.pix_cobranca_itens i
       SET dispensado_em = now(), dispensado_por = $3
       FROM public.pix_cobrancas c
       WHERE c.id = i.id_cobranca AND i.id_cobranca = $1::bigint AND i.id_assinatura = $2::bigint
         AND i.dispensado_em IS NULL
       RETURNING c.id_cliente::text, i.valor::text, c.txid`,
      [idCobranca, idAssinatura, session.user?.email ?? null]
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Esse Pix já saiu da lista." };
    }
    await registrarAudit(client, {
      tipo: "pix_link",
      id_cliente: rows[0].id_cliente,
      id_assinatura: idAssinatura,
      descricao: `Pix pelo link dispensado sem renovar (R$ ${Number(rows[0].valor).toFixed(2).replace(".", ",")})`,
      dados_depois: { txid: rows[0].txid, id_cobranca: idCobranca },
    });
    await client.query("COMMIT");
    revalidatePath("/alertas");
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    return { ok: false, error: err instanceof Error ? err.message : "Erro ao dispensar." };
  } finally {
    client.release();
  }
}
