// src/app/actions/renovarAplicativo.ts
"use server";

import { pool } from "@/lib/db";
import { revalidatePath } from "next/cache";

interface RenovarAplicativoParams {
  id_app_registro: number;
  id_cliente: number;
  renovarValidade: boolean;
  valor: number;
  forma: string;
  detalhes?: string;
}

export async function renovarAplicativo({
  id_app_registro,
  id_cliente,
  renovarValidade,
  valor,
  forma,
  detalhes = "",
}: RenovarAplicativoParams) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Dados do app + nome do cliente
    const { rows: appRows } = await client.query(
      `SELECT a.nome_app, c.nome AS cliente
       FROM apps a
       JOIN aplicativos ap ON ap.id_app = a.id_app
       JOIN clientes c ON c.id_cliente = ap.id_cliente
       WHERE ap.id_app_registro = $1`,
      [id_app_registro]
    );

    if (!appRows.length) throw new Error("Aplicativo não encontrado");
    const { nome_app, cliente } = appRows[0];

    // Verifica se cliente tem assinatura ativa
    const { rows: assRows } = await client.query(
      `SELECT 1 FROM assinaturas
       WHERE id_cliente = $1
         AND status = 'ativa'
       LIMIT 1`,
      [id_cliente]
    );
    const novoStatus = assRows.length > 0 ? "ativa" : "neutra";

    // Atualiza validade e status
    if (renovarValidade) {
      await client.query(
        `UPDATE aplicativos
         SET validade = CASE
               WHEN validade IS NULL OR validade < NOW()
                 THEN NOW() + INTERVAL '1 year'
               ELSE validade + INTERVAL '1 year'
             END,
             status = $1
         WHERE id_app_registro = $2`,
        [novoStatus, id_app_registro]
      );
    } else {
      // Só atualiza status, mantém validade
      await client.query(
        `UPDATE aplicativos
         SET status = $1
         WHERE id_app_registro = $2`,
        [novoStatus, id_app_registro]
      );
    }

    // Lança pagamento
    await client.query(
      `INSERT INTO pagamentos (cliente, compra, data_pgto, forma, valor, detalhes, tipo, id_cliente)
       VALUES ($1, $2, NOW(), $3, $4, $5, 'Licenças', $6)`,
      [
        cliente,
        nome_app,
        forma,
        valor,
        detalhes,
        id_cliente,
      ]
    );

    await client.query("COMMIT");
    revalidatePath(`/clientes/${id_cliente}`);

    return { success: true, novoStatus };
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Erro ao renovar aplicativo:", err);
    return { success: false, error: String(err) };
  } finally {
    client.release();
  }
}