// src/lib/clientes.ts
import { pool } from "@/lib/db";

export type ClienteStatusTela =
  | "sem_assinatura"
  | "ativo"
  | "atrasado"
  | "vencido"
  | "inativo"
  | "pendente"
  | "cancelado";

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
  observacao_assinatura: string | null;
  id_assinatura_principal: string | null;
};

export type GetClientesParams = {
  q?: string;
  status?: "todos" | ClienteStatusTela;
  order?: "nome" | "vencimento";
  page?: number;
  pageSize?: number;
  due?: DueFilter;
};

export type AssinaturaRow = {
  id_assinatura: string;
  criado_em: string | null;
  status: string | null;
  venc_contrato: string | null;
  venc_contas: string | null;
  identificacao: string | null;
  observacao: string | null;
  id_plano: string | null;
  id_pacote: string | null;
  pacote_contrato: string | null;
  pacote_telas: number | null;
  plano_tipo: string | null;
  plano_telas: number | null;
  plano_meses: number | null;
  plano_valor: string | null;
  plano_descricao: string | null;
  tem_vinculo_painel: boolean;
  nome_painel_vinculado: string | null;
};

export type ContaPainelVinculada = {
  id_conta: string;
  id_assinatura: string;
  usuario: string;
  senha: string | null;
  rotulo: string | null;
  status_conta: string;
  nome_painel: string;
  tipo_painel: string;
};

export async function getContasPainelByClienteId(id: string): Promise<ContaPainelVinculada[]> {
  const { rows } = await pool.query<ContaPainelVinculada>(
    `SELECT c.id_conta::text, c.id_assinatura::text, c.usuario, c.senha,
            c.rotulo, c.status_conta, ps.nome AS nome_painel, ps.tipo AS tipo_painel
     FROM public.contas c
     JOIN public.painel_servidores ps ON ps.id = c.id_painel_servidor
     WHERE c.id_assinatura IN (
       SELECT id_assinatura FROM public.assinaturas WHERE id_cliente = $1::bigint
     )
     ORDER BY ps.nome, c.usuario`,
    [id]
  );
  return rows;
}

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
    case "ontem": return -1;
    case "hoje": return 0;
    case "amanha": return 1;
    default: return null;
  }
}

export async function getClientes(params: GetClientesParams = {}): Promise<ClienteRow[]> {
  const q = (params.q ?? "").trim();
  const status = params.status ?? "todos";
  const due = params.due ?? "todos";
  const order = params.order ?? "vencimento";
  const page = clamp(Number(params.page ?? 1) || 1, 1, 9999);
  const pageSize = clamp(Number(params.pageSize ?? 50) || 50, 10, 200);
  const offset = (page - 1) * pageSize;

  const values: any[] = [];
  const whereParts: string[] = [];

  if (q) {
    values.push(`%${q}%`);
    whereParts.push(
      `(c.nome ILIKE $${values.length} OR COALESCE(c.observacao,'') ILIKE $${values.length})`
    );
  }

  const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

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

  values.push(pageSize);
  const limitParam = `$${values.length}`;
  values.push(offset);
  const offsetParam = `$${values.length}`;

  const orderSql =
    order === "vencimento"
      ? `ORDER BY
          (prox_vencimento IS NULL) ASC,
          (prox_vencimento::date < CURRENT_DATE) ASC,
          prox_vencimento::date ASC,
          nome ASC`
      : `ORDER BY nome ASC`;

  const sql = `
    WITH base AS (
      SELECT
        c.id_cliente::text AS id_cliente,
        c.nome,
        c.observacao,
        ct.telefone,
        COUNT(a.id_assinatura)
          FILTER (WHERE lower(btrim(a.status)) IN ('ativo', 'atrasado'))::int AS assinaturas_ativas,
        COALESCE(assin_near.venc_contrato, app_pend.validade) AS prox_vencimento,
        COALESCE(assin_near.pacote_nome, app_pend.pacote_nome) AS pacote_nome,
        assin_latest.observacao AS observacao_assinatura,
        assin_latest.id_assinatura AS id_assinatura_principal,
        CASE
          WHEN COUNT(a.id_assinatura) = 0
            THEN CASE
              WHEN app_pend.has_pend IS NOT NULL THEN 'pendente'
              ELSE 'sem_assinatura'
            END
          WHEN app_pend.has_pend IS NOT NULL THEN 'pendente'
          WHEN COUNT(a.id_assinatura) FILTER (WHERE lower(btrim(a.status)) = 'ativo') > 0
            THEN 'ativo'
          WHEN COUNT(a.id_assinatura) FILTER (WHERE lower(btrim(a.status)) = 'pendente') > 0
            THEN 'pendente'
          WHEN COUNT(a.id_assinatura) FILTER (WHERE lower(btrim(a.status)) = 'atrasado') > 0
            THEN 'atrasado'
          WHEN COUNT(a.id_assinatura) FILTER (WHERE lower(btrim(a.status)) = 'vencido') > 0
            THEN 'vencido'
          WHEN COUNT(a.id_assinatura) FILTER (WHERE lower(btrim(a.status)) = 'inativo') > 0
            THEN 'inativo'
          WHEN COUNT(a.id_assinatura) FILTER (WHERE lower(btrim(a.status)) = 'cancelado') > 0
            THEN 'cancelado'
          ELSE 'sem_assinatura'
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
      LEFT JOIN public.assinaturas a ON a.id_cliente = c.id_cliente
      LEFT JOIN LATERAL (
        SELECT a2.venc_contrato::text AS venc_contrato, pac.contrato::text AS pacote_nome
        FROM public.assinaturas a2
        LEFT JOIN public.pacote pac ON pac.id_pacote = a2.id_pacote
        WHERE a2.id_cliente = c.id_cliente
          AND lower(btrim(a2.status)) IN ('ativo','atrasado','pendente')
        ORDER BY ABS(a2.venc_contrato::date - CURRENT_DATE) ASC NULLS LAST
        LIMIT 1
      ) assin_near ON true
      LEFT JOIN LATERAL (
        SELECT a3.id_assinatura::text AS id_assinatura, a3.observacao
        FROM public.assinaturas a3
        WHERE a3.id_cliente = c.id_cliente
          AND lower(btrim(a3.status)) IN ('ativo','atrasado','pendente')
        ORDER BY a3.venc_contrato DESC NULLS LAST
        LIMIT 1
      ) assin_latest ON true
      LEFT JOIN LATERAL (
        SELECT ap.validade::text AS validade, app2.nome_app AS pacote_nome, 1 AS has_pend
        FROM public.aplicativos ap
        JOIN public.apps app2 ON app2.id_app = ap.id_app
        WHERE ap.id_cliente = c.id_cliente
          AND lower(btrim(ap.status)) = 'pendente'
        LIMIT 1
      ) app_pend ON true
      ${whereSql}
      GROUP BY c.id_cliente, c.nome, c.observacao, ct.telefone,
               assin_near.venc_contrato, assin_near.pacote_nome,
               assin_latest.id_assinatura, assin_latest.observacao,
               app_pend.validade, app_pend.pacote_nome, app_pend.has_pend
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
        COALESCE(assin_near.venc_contrato, app_pend.validade) AS prox_vencimento,
        CASE
          WHEN COUNT(a.id_assinatura) = 0
            THEN CASE
              WHEN app_pend.has_pend IS NOT NULL THEN 'pendente'
              ELSE 'sem_assinatura'
            END
          WHEN app_pend.has_pend IS NOT NULL THEN 'pendente'
          WHEN COUNT(a.id_assinatura) FILTER (WHERE lower(btrim(a.status)) = 'ativo') > 0
            THEN 'ativo'
          WHEN COUNT(a.id_assinatura) FILTER (WHERE lower(btrim(a.status)) = 'pendente') > 0
            THEN 'pendente'
          WHEN COUNT(a.id_assinatura) FILTER (WHERE lower(btrim(a.status)) = 'atrasado') > 0
            THEN 'atrasado'
          WHEN COUNT(a.id_assinatura) FILTER (WHERE lower(btrim(a.status)) = 'vencido') > 0
            THEN 'vencido'
          WHEN COUNT(a.id_assinatura) FILTER (WHERE lower(btrim(a.status)) = 'inativo') > 0
            THEN 'inativo'
          WHEN COUNT(a.id_assinatura) FILTER (WHERE lower(btrim(a.status)) = 'cancelado') > 0
            THEN 'cancelado'
          ELSE 'sem_assinatura'
        END AS status_tela
      FROM public.clientes c
      LEFT JOIN public.assinaturas a ON a.id_cliente = c.id_cliente
      LEFT JOIN LATERAL (
        SELECT a2.venc_contrato::text AS venc_contrato
        FROM public.assinaturas a2
        WHERE a2.id_cliente = c.id_cliente
          AND lower(btrim(a2.status)) IN ('ativo','atrasado','pendente')
        ORDER BY ABS(a2.venc_contrato::date - CURRENT_DATE) ASC NULLS LAST
        LIMIT 1
      ) assin_near ON true
      LEFT JOIN LATERAL (
        SELECT ap.validade::text AS validade, 1 AS has_pend
        FROM public.aplicativos ap
        WHERE ap.id_cliente = c.id_cliente
          AND lower(btrim(ap.status)) = 'pendente'
        LIMIT 1
      ) app_pend ON true
      ${whereSql}
      GROUP BY c.id_cliente, assin_near.venc_contrato, app_pend.validade, app_pend.has_pend
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
  criado_em: string | null;
  score_fidelidade: number | null;
  score_calculado_em: string | null;
};

export async function getAssinaturasByClienteId(id: string): Promise<AssinaturaRow[]> {
  const { rows } = await pool.query<AssinaturaRow>(
    `
    SELECT
      a.id_assinatura::text AS id_assinatura,
      a.criado_em::text     AS criado_em,
      a.status,
      a.venc_contrato::text AS venc_contrato,
      a.venc_contas::text   AS venc_contas,
      a.identificacao,
      a.observacao,
      a.id_plano::text      AS id_plano,
      a.id_pacote::text     AS id_pacote,
      p.contrato::text      AS pacote_contrato,
      p.telas::int          AS pacote_telas,
      pl.tipo::text         AS plano_tipo,
      pl.telas::int         AS plano_telas,
      pl.meses::int         AS plano_meses,
      pl.valor::text        AS plano_valor,
      pl.descricao::text    AS plano_descricao,
      EXISTS (
        SELECT 1 FROM public.contas c WHERE c.id_assinatura = a.id_assinatura
      ) AS tem_vinculo_painel,
      (SELECT ps.nome FROM public.contas c
       JOIN public.painel_servidores ps ON ps.id = c.id_painel_servidor
       WHERE c.id_assinatura = a.id_assinatura LIMIT 1) AS nome_painel_vinculado
    FROM public.assinaturas a
    LEFT JOIN public.pacote p  ON p.id_pacote = a.id_pacote
    LEFT JOIN public.planos pl ON pl.id_plano  = a.id_plano
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
      c.criado_em::text  AS criado_em,
      c.score_fidelidade,
      c.score_calculado_em::text AS score_calculado_em,
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

export async function getPagamentosByClienteId(id: string, limit: number = 5): Promise<PagamentoRow[]> {
  const { rows } = await pool.query<PagamentoRow>(
    `
    SELECT
      id,
      data_pgto::text AS data_pgto,
      forma,
      valor::text     AS valor,
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