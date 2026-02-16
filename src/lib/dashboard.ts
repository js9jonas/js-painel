// src/lib/dashboard.ts
import { pool } from "@/lib/db";

// Tipos
export type DashboardMetrics = {
  totalClientes: number;
  clientesAtivos: number;
  clientesInativos: number;
  semAssinatura: number;
  vencemHoje: number;
  vencemProximos7Dias: number;
  atrasados: number;
  receitaMesAtual: number;
  receitaMesAnterior: number;
};

export type PagamentosPorMes = {
  mes: string;
  ano: number;
  total: number;
  quantidade: number;
};

export type PagamentosPorForma = {
  forma: string;
  total: number;
  quantidade: number;
};

export type PacoteStats = {
  pacote: string;
  quantidade: number;
  percentual: number;
};

export type PlanoStats = {
  plano: string;
  quantidade: number;
  receita: number;
};

export type VencimentoProximo = {
  id_cliente: string;
  nome: string;
  venc_contrato: string;
  dias_restantes: number;
  pacote: string;
};

// Métricas gerais
export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const sql = `
    WITH clientes_stats AS (
      SELECT
        COUNT(DISTINCT c.id_cliente) AS total_clientes,
        COUNT(DISTINCT CASE 
          WHEN a.id_assinatura IS NOT NULL THEN c.id_cliente 
        END) AS clientes_com_assinatura,
        COUNT(DISTINCT CASE 
          WHEN a.id_assinatura IS NOT NULL 
          AND a.venc_contrato >= CURRENT_DATE 
          THEN c.id_cliente 
        END) AS clientes_ativos,
        COUNT(DISTINCT CASE 
          WHEN a.id_assinatura IS NOT NULL 
          AND a.venc_contrato < CURRENT_DATE 
          THEN c.id_cliente 
        END) AS clientes_inativos,
        COUNT(DISTINCT CASE 
          WHEN a.id_assinatura IS NULL 
          THEN c.id_cliente 
        END) AS sem_assinatura
      FROM public.clientes c
      LEFT JOIN public.assinaturas a 
        ON a.id_cliente = c.id_cliente 
        AND LOWER(BTRIM(a.status)) = 'ativo'
    ),
    vencimentos_stats AS (
      SELECT
        COUNT(DISTINCT CASE 
          WHEN venc_contrato::date = CURRENT_DATE 
          THEN id_cliente 
        END) AS vencem_hoje,
        COUNT(DISTINCT CASE 
          WHEN venc_contrato::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
          THEN id_cliente 
        END) AS vencem_proximos_7_dias,
        COUNT(DISTINCT CASE 
          WHEN venc_contrato::date < CURRENT_DATE 
          THEN id_cliente 
        END) AS atrasados
      FROM public.assinaturas
      WHERE LOWER(BTRIM(status)) = 'ativo'
    ),
    receita_stats AS (
      SELECT
        COALESCE(SUM(CASE 
          WHEN EXTRACT(MONTH FROM data_pgto) = EXTRACT(MONTH FROM CURRENT_DATE)
          AND EXTRACT(YEAR FROM data_pgto) = EXTRACT(YEAR FROM CURRENT_DATE)
          THEN valor 
        END), 0) AS receita_mes_atual,
        COALESCE(SUM(CASE 
          WHEN EXTRACT(MONTH FROM data_pgto) = EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '1 month')
          AND EXTRACT(YEAR FROM data_pgto) = EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '1 month')
          THEN valor 
        END), 0) AS receita_mes_anterior
      FROM public.pagamentos
      WHERE data_pgto IS NOT NULL
    )
    SELECT
      cs.total_clientes::int,
      cs.clientes_ativos::int,
      cs.clientes_inativos::int,
      cs.sem_assinatura::int,
      vs.vencem_hoje::int,
      vs.vencem_proximos_7_dias::int,
      vs.atrasados::int,
      rs.receita_mes_atual::numeric,
      rs.receita_mes_anterior::numeric
    FROM clientes_stats cs, vencimentos_stats vs, receita_stats rs;
  `;

  const { rows } = await pool.query(sql);
  const row = rows[0] || {};

  return {
    totalClientes: row.total_clientes || 0,
    clientesAtivos: row.clientes_ativos || 0,
    clientesInativos: row.clientes_inativos || 0,
    semAssinatura: row.sem_assinatura || 0,
    vencemHoje: row.vencem_hoje || 0,
    vencemProximos7Dias: row.vencem_proximos_7_dias || 0,
    atrasados: row.atrasados || 0,
    receitaMesAtual: parseFloat(row.receita_mes_atual || "0"),
    receitaMesAnterior: parseFloat(row.receita_mes_anterior || "0"),
  };
}

// Pagamentos por mês (últimos 6 meses)
export async function getPagamentosPorMes(meses: number = 6): Promise<PagamentosPorMes[]> {
  const sql = `
    SELECT
      TO_CHAR(data_pgto, 'Mon') AS mes,
      EXTRACT(YEAR FROM data_pgto)::int AS ano,
      COALESCE(SUM(valor), 0)::numeric AS total,
      COUNT(*)::int AS quantidade
    FROM public.pagamentos
    WHERE data_pgto >= CURRENT_DATE - INTERVAL '${meses} months'
      AND data_pgto IS NOT NULL
    GROUP BY TO_CHAR(data_pgto, 'Mon'), TO_CHAR(data_pgto, 'YYYY-MM'), EXTRACT(YEAR FROM data_pgto)
    ORDER BY TO_CHAR(data_pgto, 'YYYY-MM') ASC;
  `;

  const { rows } = await pool.query(sql);

  return rows.map((r) => ({
    mes: r.mes,
    ano: r.ano,
    total: parseFloat(r.total || "0"),
    quantidade: r.quantidade || 0,
  }));
}

// Pagamentos por forma de pagamento
export async function getPagamentosPorForma(): Promise<PagamentosPorForma[]> {
  const sql = `
    SELECT
      COALESCE(forma, 'Não informado') AS forma,
      COALESCE(SUM(valor), 0)::numeric AS total,
      COUNT(*)::int AS quantidade
    FROM public.pagamentos
    WHERE data_pgto >= CURRENT_DATE - INTERVAL '30 days'
      AND data_pgto IS NOT NULL
    GROUP BY forma
    ORDER BY total DESC;
  `;

  const { rows } = await pool.query(sql);

  return rows.map((r) => ({
    forma: r.forma,
    total: parseFloat(r.total || "0"),
    quantidade: r.quantidade || 0,
  }));
}

// Estatísticas de pacotes
export async function getPacotesStats(): Promise<PacoteStats[]> {
  const sql = `
    WITH total AS (
      SELECT COUNT(*)::numeric AS total
      FROM public.assinaturas
      WHERE LOWER(BTRIM(status)) = 'ativo'
    )
    SELECT
      COALESCE(p.contrato, 'Sem pacote') AS pacote,
      COUNT(*)::int AS quantidade,
      ROUND((COUNT(*)::numeric / t.total * 100), 1)::numeric AS percentual
    FROM public.assinaturas a
    LEFT JOIN public.pacote p ON p.id_pacote = a.id_pacote
    CROSS JOIN total t
    WHERE LOWER(BTRIM(a.status)) = 'ativo'
    GROUP BY p.contrato, t.total
    ORDER BY quantidade DESC;
  `;

  const { rows } = await pool.query(sql);

  return rows.map((r) => ({
    pacote: r.pacote,
    quantidade: r.quantidade || 0,
    percentual: parseFloat(r.percentual || "0"),
  }));
}

// Estatísticas de planos
export async function getPlanosStats(): Promise<PlanoStats[]> {
  const sql = `
    SELECT
      COALESCE(pl.tipo, 'Sem plano') AS plano,
      COUNT(*)::int AS quantidade,
      COALESCE(SUM(pl.valor), 0)::numeric AS receita
    FROM public.assinaturas a
    LEFT JOIN public.planos pl ON pl.id_plano = a.id_plano
    WHERE LOWER(BTRIM(a.status)) = 'ativo'
    GROUP BY pl.tipo
    ORDER BY quantidade DESC;
  `;

  const { rows } = await pool.query(sql);

  return rows.map((r) => ({
    plano: r.plano,
    quantidade: r.quantidade || 0,
    receita: parseFloat(r.receita || "0"),
  }));
}

// Vencimentos próximos
export async function getVencimentosProximos(dias: number = 7): Promise<VencimentoProximo[]> {
  const sql = `
    SELECT
      c.id_cliente::text,
      c.nome,
      a.venc_contrato::text,
      (a.venc_contrato::date - CURRENT_DATE)::int AS dias_restantes,
      COALESCE(p.contrato, 'Sem pacote') AS pacote
    FROM public.assinaturas a
    INNER JOIN public.clientes c ON c.id_cliente = a.id_cliente
    LEFT JOIN public.pacote p ON p.id_pacote = a.id_pacote
    WHERE LOWER(BTRIM(a.status)) = 'ativo'
      AND a.venc_contrato::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '${dias} days'
    ORDER BY a.venc_contrato ASC
    LIMIT 10;
  `;

  const { rows } = await pool.query(sql);

  return rows.map((r) => ({
    id_cliente: r.id_cliente,
    nome: r.nome,
    venc_contrato: r.venc_contrato,
    dias_restantes: r.dias_restantes,
    pacote: r.pacote,
  }));
}