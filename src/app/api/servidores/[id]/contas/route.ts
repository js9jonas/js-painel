export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

// Lista contas do banco para um servidor (com filtro opcional de vencimento)
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const idServidor = Number(params.id);
    const { searchParams } = new URL(req.url);
    const dias = searchParams.get("vence_em_dias");
    const q = searchParams.get("q");

    let query = `
      SELECT c.id_conta, c.usuario, c.rotulo, c.vencimento_real_painel, c.status_conta,
             a.id_cliente, cl.nome as nome_cliente
      FROM public.contas c
      LEFT JOIN public.aplicativos a ON a.id_conta = c.id_conta
      LEFT JOIN public.clientes cl ON cl.id_cliente = a.id_cliente
      WHERE c.id_servidor = $1
    `;
    const values: any[] = [idServidor];

    if (dias) {
      values.push(Number(dias));
      query += ` AND c.vencimento_real_painel <= CURRENT_DATE + ($${values.length} || ' days')::interval`;
    }
    if (q) {
      values.push(`%${q}%`);
      query += ` AND (c.usuario ILIKE $${values.length} OR c.rotulo ILIKE $${values.length})`;
    }

    query += ` ORDER BY c.vencimento_real_painel ASC NULLS LAST`;

    const { rows } = await pool.query(query, values);
    return NextResponse.json({ ok: true, data: rows });
  } catch (err: any) {
    console.error("Erro ao listar contas:", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Erro interno" }, { status: 500 });
  }
}
