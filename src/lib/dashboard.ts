// src/lib/dashboard.ts
import { pool } from "@/lib/db";
import { getPrevisaoEsgotamento } from "@/lib/saldoServidor";

export async function getServidoresUsoComPrevisao() {
  const [servidores, previsoes] = await Promise.all([
    getServidoresUso(),
    getPrevisaoEsgotamento(),
  ]);
  const previsaoMap = Object.fromEntries(
    previsoes.map((p) => [p.id_servidor, p.data_esgotamento])
  );
  return servidores.map((s) => ({
    ...s,
    data_esgotamento: previsaoMap[s.id_servidor] ?? null,
  }));
}
// ─── Tipos existentes ────────────────────────────────────────────────────────

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

export type VendaDiaria = {
  dia: number;
  data: string;
  total: number;
  quantidade: number;
};

export type VendaUltimos30Dias = {
  data: string;
  total: number;
  quantidade: number;
  ticketMedio: number;
};

// ─── Tipos novos ─────────────────────────────────────────────────────────────

export type ClientesNovosMes = {
  mes: string;       // "Jan", "Fev" etc
  mes_num: number;   // ← adicionar
  ano: number;
  quantidade: number;
};

export type AssinaturasStatusDist = {
  status: string;
  quantidade: number;
  percentual: number;
};

export type ServidorUso = {
  id_servidor: string;
  codigo_publico: string;
  nome_interno: string;
  qtd_assinaturas: number;
  creditos_mensal: number;
  saldo_atual: number;
  data_esgotamento: string | null;
};

export type NaoRenovadosMes = {
  mes: string;
  mes_num: number;   // ← adicionar
  ano: number;
  quantidade: number;
};

export type MetricasQuantitativas = {
  clientesAtivos: number;
  novosMes: number;
  renovadasHoje: number;
  pendentes: number;           // assinaturas pendentes
  appsPendentes: number;       // aplicativos com status pendente
  vencendo7dias: number;
  naoRenovadosMes: number;     // vencidos/cancelados sem renovar no mês atual
};

// ─── Queries existentes ───────────────────────────────────────────────────────

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const sql = `
    WITH clientes_stats AS (
      SELECT
        COUNT(DISTINCT c.id_cliente) AS total_clientes,
        COUNT(DISTINCT CASE WHEN a.id_assinatura IS NOT NULL THEN c.id_cliente END) AS clientes_com_assinatura,
        COUNT(DISTINCT CASE WHEN a.id_assinatura IS NOT NULL AND a.venc_contrato >= CURRENT_DATE THEN c.id_cliente END) AS clientes_ativos,
        COUNT(DISTINCT CASE WHEN a.id_assinatura IS NOT NULL AND a.venc_contrato < CURRENT_DATE THEN c.id_cliente END) AS clientes_inativos,
        COUNT(DISTINCT CASE WHEN a.id_assinatura IS NULL THEN c.id_cliente END) AS sem_assinatura
      FROM public.clientes c
      LEFT JOIN public.assinaturas a ON a.id_cliente = c.id_cliente AND LOWER(BTRIM(a.status)) = 'ativo'
    ),
    vencimentos_stats AS (
      SELECT
        COUNT(DISTINCT CASE WHEN venc_contrato::date = CURRENT_DATE THEN id_cliente END) AS vencem_hoje,
        COUNT(DISTINCT CASE WHEN venc_contrato::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' THEN id_cliente END) AS vencem_proximos_7_dias,
        COUNT(DISTINCT CASE WHEN venc_contrato::date < CURRENT_DATE THEN id_cliente END) AS atrasados
      FROM public.assinaturas WHERE LOWER(BTRIM(status)) = 'ativo'
    ),
    receita_stats AS (
      SELECT
        COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM data_pgto) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM data_pgto) = EXTRACT(YEAR FROM CURRENT_DATE) THEN valor END), 0) AS receita_mes_atual,
        COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM data_pgto) = EXTRACT(MONTH FROM CURRENT_DATE - INTERVAL '1 month') AND EXTRACT(YEAR FROM data_pgto) = EXTRACT(YEAR FROM CURRENT_DATE - INTERVAL '1 month') THEN valor END), 0) AS receita_mes_anterior
      FROM public.pagamentos WHERE data_pgto IS NOT NULL
    )
    SELECT cs.total_clientes::int, cs.clientes_ativos::int, cs.clientes_inativos::int, cs.sem_assinatura::int,
           vs.vencem_hoje::int, vs.vencem_proximos_7_dias::int, vs.atrasados::int,
           rs.receita_mes_atual::numeric, rs.receita_mes_anterior::numeric
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

export async function getPagamentosPorMes(meses: number = 6): Promise<PagamentosPorMes[]> {
  const sql = `
    SELECT TO_CHAR(data_pgto, 'Mon') AS mes, EXTRACT(YEAR FROM data_pgto)::int AS ano,
           COALESCE(SUM(valor), 0)::numeric AS total, COUNT(*)::int AS quantidade
    FROM public.pagamentos
    WHERE data_pgto >= CURRENT_DATE - INTERVAL '${meses} months' AND data_pgto IS NOT NULL
    GROUP BY TO_CHAR(data_pgto, 'Mon'), TO_CHAR(data_pgto, 'YYYY-MM'), EXTRACT(YEAR FROM data_pgto)
    ORDER BY TO_CHAR(data_pgto, 'YYYY-MM') ASC;
  `;
  const { rows } = await pool.query(sql);
  return rows.map((r) => ({ mes: r.mes, mes_num: r.mes_num, ano: r.ano, total: parseFloat(r.total || "0"), quantidade: r.quantidade || 0 }));
}

export async function getPacotesStats(): Promise<PacoteStats[]> {
  const sql = `
    WITH total AS (SELECT COUNT(*)::numeric AS total FROM public.assinaturas WHERE LOWER(BTRIM(status)) = 'ativo')
    SELECT COALESCE(p.contrato, 'Sem pacote') AS pacote, COUNT(*)::int AS quantidade,
           ROUND((COUNT(*)::numeric / t.total * 100), 1)::numeric AS percentual
    FROM public.assinaturas a
    LEFT JOIN public.pacote p ON p.id_pacote = a.id_pacote
    CROSS JOIN total t
    WHERE LOWER(BTRIM(a.status)) = 'ativo'
    GROUP BY p.contrato, t.total ORDER BY quantidade DESC;
  `;
  const { rows } = await pool.query(sql);
  return rows.map((r) => ({ pacote: r.pacote, quantidade: r.quantidade || 0, percentual: parseFloat(r.percentual || "0") }));
}

export async function getPlanosStats(): Promise<PlanoStats[]> {
  const sql = `
    SELECT COALESCE(pl.tipo, 'Sem plano') AS plano, COUNT(*)::int AS quantidade,
           COALESCE(SUM(pl.valor), 0)::numeric AS receita
    FROM public.assinaturas a
    LEFT JOIN public.planos pl ON pl.id_plano = a.id_plano
    WHERE LOWER(BTRIM(a.status)) = 'ativo'
    GROUP BY pl.tipo ORDER BY quantidade DESC;
  `;
  const { rows } = await pool.query(sql);
  return rows.map((r) => ({ plano: r.plano, quantidade: r.quantidade || 0, receita: parseFloat(r.receita || "0") }));
}

export async function getVencimentosProximos(dias: number = 7): Promise<VencimentoProximo[]> {
  const sql = `
    SELECT c.id_cliente::text, c.nome, a.venc_contrato::text,
           (a.venc_contrato::date - CURRENT_DATE)::int AS dias_restantes,
           COALESCE(p.contrato, 'Sem pacote') AS pacote
    FROM public.assinaturas a
    INNER JOIN public.clientes c ON c.id_cliente = a.id_cliente
    LEFT JOIN public.pacote p ON p.id_pacote = a.id_pacote
    WHERE LOWER(BTRIM(a.status)) = 'ativo'
      AND a.venc_contrato::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '${dias} days'
    ORDER BY a.venc_contrato ASC LIMIT 10;
  `;
  const { rows } = await pool.query(sql);
  return rows.map((r) => ({ id_cliente: r.id_cliente, nome: r.nome, venc_contrato: r.venc_contrato, dias_restantes: r.dias_restantes, pacote: r.pacote }));
}

export async function getReceitaHoje(): Promise<number> {
  const result = await pool.query(`SELECT COALESCE(SUM(valor), 0)::numeric AS total FROM public.pagamentos WHERE DATE(data_pgto) = CURRENT_DATE`);
  return parseFloat(result.rows[0].total);
}

export async function getVendasDiariasDoMes(): Promise<VendaDiaria[]> {
  const result = await pool.query(`
    SELECT EXTRACT(DAY FROM data_pgto)::int AS dia, TO_CHAR(data_pgto, 'DD/MM') AS data,
           COALESCE(SUM(valor), 0)::numeric AS total, COUNT(*)::int AS quantidade
    FROM public.pagamentos
    WHERE EXTRACT(MONTH FROM data_pgto) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(YEAR FROM data_pgto) = EXTRACT(YEAR FROM CURRENT_DATE)
      AND data_pgto IS NOT NULL
    GROUP BY EXTRACT(DAY FROM data_pgto), TO_CHAR(data_pgto, 'DD/MM')
    ORDER BY EXTRACT(DAY FROM data_pgto) ASC
  `);
  return result.rows.map((r) => ({ dia: r.dia, data: r.data, total: parseFloat(r.total), quantidade: r.quantidade }));
}

export async function getVendasUltimos30Dias(): Promise<VendaUltimos30Dias[]> {
  const result = await pool.query(`
    SELECT TO_CHAR(data_pgto, 'DD/MM') AS data, data_pgto::date AS data_ord,
           COALESCE(SUM(valor), 0)::numeric AS total, COUNT(*)::int AS quantidade,
           CASE WHEN COUNT(*) > 0 THEN (COALESCE(SUM(valor), 0) / COUNT(*))::numeric ELSE 0 END AS ticket_medio
    FROM public.pagamentos
    WHERE data_pgto >= CURRENT_DATE - INTERVAL '30 days' AND data_pgto IS NOT NULL
    GROUP BY TO_CHAR(data_pgto, 'DD/MM'), data_pgto::date
    ORDER BY data_pgto::date ASC
  `);
  return result.rows.map((r) => ({ data: r.data, total: parseFloat(r.total), quantidade: r.quantidade, ticketMedio: parseFloat(r.ticket_medio) }));
}

// ─── Queries novas ────────────────────────────────────────────────────────────

/** Métricas quantitativas consolidadas */
export async function getMetricasQuantitativas(): Promise<MetricasQuantitativas> {
  const { rows } = await pool.query(`
    SELECT
      -- Clientes ativos (com assinatura ativo/atrasado)
      (SELECT COUNT(DISTINCT id_cliente) FROM public.assinaturas
       WHERE lower(btrim(status)) IN ('ativo','atrasado'))::int AS clientes_ativos,

      -- Novos clientes este mês
      (SELECT COUNT(*) FROM public.clientes
       WHERE EXTRACT(MONTH FROM criado_em) = EXTRACT(MONTH FROM CURRENT_DATE)
         AND EXTRACT(YEAR FROM criado_em) = EXTRACT(YEAR FROM CURRENT_DATE))::int AS novos_mes,

      (SELECT COUNT(*) FROM public.pagamentos
 WHERE DATE(data_pgto) = CURRENT_DATE
   AND tipo = 'Assinatura tv')::int AS renovadas_hoje,

      -- Assinaturas pendentes
      (SELECT COUNT(*) FROM public.assinaturas
       WHERE lower(btrim(status)) = 'pendente')::int AS pendentes,

      -- Apps pendentes
      (SELECT COUNT(*) FROM public.aplicativos
       WHERE lower(btrim(status)) = 'pendente')::int AS apps_pendentes,

      -- Vencendo nos próximos 7 dias (venc_contas)
      (SELECT COUNT(*) FROM public.assinaturas
       WHERE lower(btrim(status)) IN ('ativo','atrasado')
         AND venc_contas::date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7)::int AS vencendo_7dias,

      -- Não renovados: ficaram vencidos este mês (venc_contas expirou no mês atual)
      (SELECT COUNT(*) FROM public.assinaturas
       WHERE lower(btrim(status)) IN ('vencido','cancelado','inativo')
         AND EXTRACT(MONTH FROM venc_contas) = EXTRACT(MONTH FROM CURRENT_DATE)
         AND EXTRACT(YEAR FROM venc_contas) = EXTRACT(YEAR FROM CURRENT_DATE))::int AS nao_renovados_mes
  `);
  const r = rows[0] || {};
  return {
    clientesAtivos: r.clientes_ativos || 0,
    novosMes: r.novos_mes || 0,
    renovadasHoje: r.renovadas_hoje || 0,
    pendentes: r.pendentes || 0,
    appsPendentes: r.apps_pendentes || 0,
    vencendo7dias: r.vencendo_7dias || 0,
    naoRenovadosMes: r.nao_renovados_mes || 0,
  };
}

/** Clientes novos por mês — últimos 6 meses */
export async function getClientesNovosPorMes(): Promise<ClientesNovosMes[]> {
  const { rows } = await pool.query(`
    SELECT
      TO_CHAR(DATE_TRUNC('month', criado_em), 'Mon') AS mes,
      EXTRACT(YEAR FROM criado_em)::int AS ano,
      EXTRACT(MONTH FROM criado_em)::int AS mes_num,
      COUNT(*)::int AS quantidade
    FROM public.clientes
    WHERE criado_em >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
    GROUP BY DATE_TRUNC('month', criado_em), EXTRACT(YEAR FROM criado_em), EXTRACT(MONTH FROM criado_em)
    ORDER BY DATE_TRUNC('month', criado_em) ASC
  `);
  return rows.map((r) => ({ mes: r.mes, mes_num: r.mes_num, ano: r.ano, quantidade: r.quantidade }));
}

/** Assinaturas não renovadas por mês — últimos 6 meses */
export async function getNaoRenovadosPorMes(): Promise<NaoRenovadosMes[]> {
  const { rows } = await pool.query(`
    SELECT
  TO_CHAR(DATE_TRUNC('month', venc_contas), 'Mon') AS mes,
  EXTRACT(YEAR FROM venc_contas)::int AS ano,
  EXTRACT(MONTH FROM venc_contas)::int AS mes_num,
  COUNT(*)::int AS quantidade
FROM public.assinaturas
WHERE lower(btrim(status)) IN ('vencido','cancelado','inativo')
  AND venc_contas >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '5 months'
  AND venc_contas < CURRENT_DATE
GROUP BY DATE_TRUNC('month', venc_contas), EXTRACT(YEAR FROM venc_contas), EXTRACT(MONTH FROM venc_contas)
ORDER BY DATE_TRUNC('month', venc_contas) ASC
  `);
  return rows.map((r) => ({ mes: r.mes, mes_num: r.mes_num, ano: r.ano, quantidade: r.quantidade }));
}

/** Uso real por servidor baseado em consumo_servidor + assinaturas ativas */
export async function getServidoresUso(): Promise<ServidorUso[]> {
  const { rows } = await pool.query(`
    SELECT
      s.id_servidor::text,
      s.codigo_publico,
      s.nome_interno,
      COUNT(DISTINCT a.id_assinatura)::int       AS qtd_assinaturas,
      COALESCE(SUM(cs.creditos_mensal), 0)::int  AS creditos_mensal,
      COALESCE(ss.saldo_atual, 0)::int           AS saldo_atual
    FROM public.servidores s
    JOIN public.consumo_servidor cs ON cs.id_servidor = s.id_servidor
    JOIN public.assinaturas a ON a.id_pacote = cs.id_pacote
    LEFT JOIN public.saldo_servidor ss ON ss.id_servidor = s.id_servidor
    WHERE s.ativo = true
      AND lower(btrim(a.status)) IN ('ativo','atrasado')
    GROUP BY s.id_servidor, s.codigo_publico, s.nome_interno, ss.saldo_atual
    ORDER BY creditos_mensal DESC
  `);
  return rows.map((r) => ({
    id_servidor: r.id_servidor,
    codigo_publico: r.codigo_publico,
    nome_interno: r.nome_interno,
    qtd_assinaturas: r.qtd_assinaturas,
    creditos_mensal: r.creditos_mensal,
    saldo_atual: r.saldo_atual,
    data_esgotamento: null,
  }));
}

/** Distribuição de status das assinaturas */
export async function getStatusAssinaturas(): Promise<AssinaturasStatusDist[]> {
  const { rows } = await pool.query(`
    WITH total AS (
     SELECT COUNT(*)::numeric AS t FROM public.assinaturas
     WHERE venc_contrato >= CURRENT_DATE - INTERVAL '6 months'
)
    SELECT
      lower(btrim(status)) AS status,
      COUNT(*)::int AS quantidade,
      ROUND(COUNT(*)::numeric / t.t * 100, 1)::numeric AS percentual
    FROM public.assinaturas, total t
    WHERE venc_contrato >= CURRENT_DATE - INTERVAL '6 months'
    GROUP BY lower(btrim(status)), t.t
    ORDER BY quantidade DESC
  `);
  return rows.map((r) => ({ status: r.status, quantidade: r.quantidade, percentual: parseFloat(r.percentual) }));
}