// src/lib/pagamentos.ts
import { pool } from "@/lib/db";

export type PagamentoFullRow = {
  id: number;
  id_cliente: string;
  nome_cliente: string | null;
  data_pgto: string | null;
  forma: string | null;
  valor: string | null;
  detalhes: string | null;
  tipo: string | null;
  compra: string | null;
};

export type GetPagamentosParams = {
  q?: string;
  page?: number;
  pageSize?: number;
  id_cliente?: string;
};

function buildWhere(params: Omit<GetPagamentosParams, "page" | "pageSize">) {
  const q = (params.q ?? "").trim();
  const values: unknown[] = [];
  const parts: string[] = [];

  if (q) {
    values.push(`%${q}%`);
    parts.push(
      `(c.nome ILIKE $${values.length} OR p.detalhes ILIKE $${values.length} OR p.compra ILIKE $${values.length})`
    );
  }

  if (params.id_cliente) {
    values.push(params.id_cliente);
    parts.push(`p.id_cliente = $${values.length}::bigint`);
  }

  return {
    whereSql: parts.length ? `WHERE ${parts.join(" AND ")}` : "",
    values,
  };
}

export async function getPagamentos(
  params: GetPagamentosParams = {}
): Promise<PagamentoFullRow[]> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(200, Math.max(10, params.pageSize ?? 50));
  const offset = (page - 1) * pageSize;

  const { whereSql, values } = buildWhere(params);

  values.push(pageSize);
  const limitParam = `$${values.length}`;
  values.push(offset);
  const offsetParam = `$${values.length}`;

  const { rows } = await pool.query<PagamentoFullRow>(
    `SELECT
       p.id,
       p.id_cliente::text,
       c.nome AS nome_cliente,
       p.data_pgto::text,
       p.forma,
       p.valor::text,
       p.detalhes,
       p.tipo,
       p.compra
     FROM public.pagamentos p
     LEFT JOIN public.clientes c ON c.id_cliente = p.id_cliente
     ${whereSql}
     ORDER BY p.data_pgto DESC NULLS LAST, p.id DESC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    values
  );

  return rows;
}

export async function countPagamentos(
  params: Omit<GetPagamentosParams, "page" | "pageSize"> = {}
): Promise<number> {
  const { whereSql, values } = buildWhere(params);

  const { rows } = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM public.pagamentos p
     LEFT JOIN public.clientes c ON c.id_cliente = p.id_cliente
     ${whereSql}`,
    values
  );

  return rows[0]?.total ?? 0;
}
