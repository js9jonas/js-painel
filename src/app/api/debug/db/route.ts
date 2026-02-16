import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  const info = await pool.query(`
    SELECT
      current_database() AS db,
      current_schema()   AS schema,
      current_user       AS usr,
      inet_server_addr() AS server_ip,
      inet_server_port() AS server_port
  `);

  const sample = await pool.query(
    `
    SELECT id_assinatura, id_cliente, status, venc_contrato, atualizado_em
    FROM public.assinaturas
    WHERE id_cliente = $1
    ORDER BY atualizado_em DESC NULLS LAST
    LIMIT 10
    `,
    [2385]
  );

  return NextResponse.json({
    conn: info.rows[0],
    rows: sample.rows,
    count: sample.rowCount,
  });
}
