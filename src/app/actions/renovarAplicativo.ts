"use server";

import { pool } from "@/lib/db";
import { revalidatePath } from "next/cache";

export interface RenovarAplicativoParams {
  id_app_registro: number;
  id_cliente: number;
  novaValidade: string;           // YYYY-MM-DD
  modo: "cortesia" | "pagamento" | "pendente";
  valor?: number;
  forma?: string;
  detalhes?: string;
}

export async function renovarAplicativo({
  id_app_registro,
  id_cliente,
  novaValidade,
  modo,
  valor = 0,
  forma = "PIX",
  detalhes = "",
}: RenovarAplicativoParams) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Busca nome do app e do cliente
    const { rows: appRows } = await client.query(
      `SELECT a.nome_app, c.nome AS cliente
       FROM public.apps a
       JOIN public.aplicativos ap ON ap.id_app = a.id_app
       JOIN public.clientes c ON c.id_cliente = ap.id_cliente
       WHERE ap.id_app_registro = $1`,
      [id_app_registro]
    );

    if (!appRows.length) throw new Error("Aplicativo não encontrado");
    const { nome_app, cliente } = appRows[0];

    // Define novo status conforme modo
    const novoStatus =
      modo === "pendente" ? "pendente" : "ativa";

    // Atualiza validade e status
    await client.query(
      `UPDATE public.aplicativos
       SET validade = $1::date,
           status   = $2,
           atualizado_em = NOW()
       WHERE id_app_registro = $3`,
      [novaValidade, novoStatus, id_app_registro]
    );

    // Lança pagamento somente no modo pagamento
    if (modo === "pagamento") {
      await client.query(
        `INSERT INTO public.pagamentos
           (id_cliente, cliente, compra, data_pgto, forma, valor, detalhes, tipo, atualizado_em)
         VALUES ($1, $2, $3, CURRENT_DATE, $4, $5::numeric, $6, 'Licenças', NOW())`,
        [id_cliente, cliente, nome_app, forma, valor, detalhes || "OK"]
      );
    }

    await client.query("COMMIT");
    revalidatePath(`/clientes/${id_cliente}`);

    return { success: true };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Erro ao renovar aplicativo:", err);
    return { success: false, error: String(err) };
  } finally {
    client.release();
  }
}