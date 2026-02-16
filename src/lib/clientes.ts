// src/lib/clientes.ts
import { pool } from "@/lib/db";

export type ClienteStatusTela = "sem_assinatura" | "atrasado" | "ok";
export type DueFilter = "todos" | "ontem" | "hoje" | "amanha";

export type ClienteRow = {
  id_cliente: string;
  nome: string;
  observacao: string | null;
  prox_vencimento: string | null;
  status_tela: ClienteStatusTela;
  assinaturas_ativas: number;
  telefone: string | null;
  pacote_nome: string | null;
};

export type GetClientesParams = {
  q?: string;
  status?: "todos" | ClienteStatusTela;
  order?: "nome" | "vencimento";
  page?: number; // 1..N
  pageSize?: number; // ex: 50, 100
  due?: DueFilter; // <-- NOVO (guias)
};

export type AssinaturaRow = {
  id_assinatura: string;
  status: string | null;
  venc_contrato: string | null;
  venc_contas: string | null;
  identificacao: string | null;
  id_plano: string | null;
  id_pacote: string | null;

  // detalhes pacote
  pacote_contrato: string | null;
  pacote_telas: number | null;

  // detalhes plano
  plano_tipo: string | null;
  plano_telas: number | null;
  plano_meses: number | null;
  plano_valor: string | null;      // vem como string no pg muitas vezes
  plano_descricao: string | null;
};

// NOVO: Tipo para pagamentos
export type PagamentoRow = {
  id: number;
  data_pgto: string | null;
  forma: string | null;
  valor: string | null;
  detalhes: string | null;
  tipo: string | null;
  compra: string | null;
};


function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function buildBaseWhere(q: string) {
  const whereParts: string[] = [];
  const values: any[] = [];

  if (q) {
    values.push(`%${q}%`);
    whereParts.push(
      `(c.nome ILIKE $${values.length} OR COALESCE(c.observacao,'') ILIKE $${values.length})`
    );
  }

  const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
  return { whereSql, values };
}

function dueOffset(due: DueFilter) {
  switch (due) {
    case "ontem":
      return -1;
    case "hoje":
      return 0;
    case "amanha":
      return 1;
    default:
      return null;
  }
}

export async function getClientes(params: GetClientesParams = {}): Promise<ClienteRow[]> {
  const q = (params.q ?? "").trim();
  const status = params.status ?? "todos";
  const due = params.due ?? "todos";
  const order = params.order ?? "nome";

  const page = clamp(Number(params.page ?? 1) || 1, 1, 9999);
  const pageSize = clamp(Number(params.pageSize ?? 50) || 50, 10, 200);
  const offset = (page - 1) * pageSize;

  // filtros pré-agregação (nome/obs)
  const values: any[] = [];
  const whereParts: string[] = [];

  if (q) {
    values.push(`%${q}%`);
    whereParts.push(
      `(c.nome ILIKE $${values.length} OR COALESCE(c.observacao,'') ILIKE $${values.length})`
    );
  }

  const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

  // filtros pós-agregação (status_tela, due)
  const postWhereParts: string[] = [];

  if (status !== "todos") {
    values.push(status);
    postWhereParts.push(`status_tela = $${values.length}`);
  }

  const off = dueOffset(due);
  if (off !== null) {
    values.push(off);
    postWhereParts.push(
      `prox_vencimento::date = (CURRENT_DATE + $${values.length}::int)`
    );
  }

  const postWhereSql = postWhereParts.length
    ? `WHERE ${postWhereParts.join(" AND ")}`
    : "";

  // LIMIT e OFFSET (sempre por último)
  values.push(pageSize);
  const limitParam = `$${values.length}`;
  values.push(offset);
  const offsetParam = `$${values.length}`;

  const orderSql =
    order === "vencimento"
      ? `ORDER BY (prox_vencimento IS NULL) ASC, prox_vencimento::date ASC, nome ASC`
      : `ORDER BY nome ASC`;

  const sql = `
    WITH base AS (
      SELECT
        c.id_cliente::text AS id_cliente,
        c.nome,
        c.observacao,
        ct.telefone,
        COUNT(a.id_assinatura)::int AS assinaturas_ativas,
        MAX(a.venc_contrato)::text AS prox_vencimento,
        (
          SELECT pac.contrato::text
          FROM public.assinaturas a2
          LEFT JOIN public.pacote pac ON pac.id_pacote = a2.id_pacote
          WHERE a2.id_cliente = c.id_cliente
            AND lower(btrim(a2.status)) = 'ativo'
          ORDER BY a2.venc_contrato DESC NULLS LAST
          LIMIT 1
        ) AS pacote_nome,
        CASE
          WHEN COUNT(a.id_assinatura) = 0 THEN 'sem_assinatura'
          WHEN MAX(a.venc_contrato) < CURRENT_DATE THEN 'atrasado'
          ELSE 'ok'
        END AS status_tela
      FROM public.clientes c
      LEFT JOIN LATERAL (
        SELECT ct.telefone::text AS telefone
        FROM public.contatos ct
        WHERE ct.id_cliente = c.id_cliente
          AND ct.telefone IS NOT NULL
          AND btrim(ct.telefone) <> ''
        ORDER BY ct.atualizado_em DESC NULLS LAST, ct.criado_em DESC NULLS LAST, ct.id_contato DESC
        LIMIT 1
      ) ct ON true
      LEFT JOIN public.assinaturas a
        ON a.id_cliente = c.id_cliente
        AND lower(btrim(a.status)) = 'ativo'
      ${whereSql}
      GROUP BY c.id_cliente, c.nome, c.observacao, ct.telefone
    )
    SELECT *
    FROM base
    ${postWhereSql}
    ${orderSql}
    LIMIT ${limitParam} OFFSET ${offsetParam};
  `;

  const { rows } = await pool.query<ClienteRow>(sql, values);
  return rows;
}

export async function countClientes(
  params: Omit<GetClientesParams, "page" | "pageSize"> = {}
) {
  const q = (params.q ?? "").trim();
  const status = params.status ?? "todos";
  const due = params.due ?? "todos";

  const { whereSql, values } = buildBaseWhere(q);

  const postWhereParts: string[] = [];

  if (status !== "todos") {
    values.push(status);
    postWhereParts.push(`status_tela = $${values.length}`);
  }

  const off = dueOffset(due);
  if (off !== null) {
    values.push(off);
    postWhereParts.push(
      `prox_vencimento::date = (CURRENT_DATE + $${values.length}::int)`
    );
  }

  const postWhereSql = postWhereParts.length
    ? `WHERE ${postWhereParts.join(" AND ")}`
    : "";

  const sql = `
    WITH base AS (
      SELECT
        c.id_cliente::text AS id_cliente,
        MAX(a.venc_contrato)::text AS prox_vencimento,
        CASE
          WHEN COUNT(a.id_assinatura) = 0 THEN 'sem_assinatura'
          WHEN MAX(a.venc_contrato) < CURRENT_DATE THEN 'atrasado'
          ELSE 'ok'
        END AS status_tela
      FROM public.clientes c
      LEFT JOIN public.assinaturas a
        ON a.id_cliente = c.id_cliente
       AND lower(btrim(a.status)) = 'ativo'
      ${whereSql}
      GROUP BY c.id_cliente
    )
    SELECT COUNT(*)::int AS total
    FROM base
    ${postWhereSql};
  `;

  const { rows } = await pool.query<{ total: number }>(sql, values);
  return rows[0]?.total ?? 0;
}

export type ClienteDetalheRow = {
  id_cliente: string;
  nome: string;
  observacao: string | null;
  telefone: string | null;
};

export async function getAssinaturasByClienteId(id: string): Promise<AssinaturaRow[]> {
  const { rows } = await pool.query<AssinaturaRow>(
    `
    SELECT
      a.id_assinatura::text AS id_assinatura,
      a.status,
      a.venc_contrato::text AS venc_contrato,
      a.venc_contas::text AS venc_contas,
      a.identificacao,
      a.id_plano::text AS id_plano,
      a.id_pacote::text AS id_pacote,

      p.contrato::text AS pacote_contrato,
      p.telas::int AS pacote_telas,

      pl.tipo::text AS plano_tipo,
      pl.telas::int AS plano_telas,
      pl.meses::int AS plano_meses,
      pl.valor::text AS plano_valor,
      pl.descricao::text AS plano_descricao

    FROM public.assinaturas a
    LEFT JOIN public.pacote p
      ON p.id_pacote = a.id_pacote
    LEFT JOIN public.planos pl
      ON pl.id_plano = a.id_plano

    WHERE a.id_cliente = $1::bigint
    ORDER BY a.atualizado_em DESC NULLS LAST, a.criado_em DESC NULLS LAST;
    `,
    [id]
  );

  return rows;
}

export async function getClienteById(id: string): Promise<ClienteDetalheRow | null> {
  const { rows } = await pool.query<ClienteDetalheRow>(
    `
    SELECT
      c.id_cliente::text AS id_cliente,
      c.nome,
      c.observacao,

      (
        SELECT ct.telefone::text
        FROM public.contatos ct
        WHERE ct.id_cliente = c.id_cliente
          AND ct.telefone IS NOT NULL
          AND btrim(ct.telefone) <> ''
        ORDER BY ct.atualizado_em DESC NULLS LAST, ct.criado_em DESC NULLS LAST, ct.id_contato DESC
        LIMIT 1
      ) AS telefone

    FROM public.clientes c
    WHERE c.id_cliente = $1::bigint
    LIMIT 1;
    `,
    [id]
  );

  return rows[0] ?? null;
}

// NOVA FUNÇÃO: Buscar últimos pagamentos do cliente
export async function getPagamentosByClienteId(id: string, limit: number = 5): Promise<PagamentoRow[]> {
  const { rows } = await pool.query<PagamentoRow>(
    `
    SELECT
      id,
      data_pgto::text AS data_pgto,
      forma,
      valor::text AS valor,
      detalhes,
      tipo,
      compra
    FROM public.pagamentos
    WHERE id_cliente = $1::bigint
    ORDER BY data_pgto DESC NULLS LAST, id DESC
    LIMIT $2;
    `,
    [id, limit]
  );

  return rows;
}