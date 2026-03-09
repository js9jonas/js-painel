// src/lib/saldoServidor.ts
import { pool } from "@/lib/db";

export type SaldoServidorRow = {
  id_servidor: string;
  codigo_publico: string;
  nome_interno: string;
  saldo_atual: number;
  atualizado_em: string;
  exibir_saldo: boolean;
};

export type SaldoHistoricoRow = {
  id_historico: string;
  tipo: string;
  quantidade: number;
  saldo_anterior: number;
  saldo_novo: number;
  observacao: string | null;
  id_assinatura: string | null;
  criado_em: string;
};

export type PrevisaoRow = {
  id_servidor: string;
  data_esgotamento: string | null; // null = saldo suficiente além de 24 meses
};

export type ConsumoMensalRow = {
  id_servidor: string;
  creditos_mensal: number;
};


export async function getSaldosServidores(): Promise<SaldoServidorRow[]> {
  const { rows } = await pool.query<SaldoServidorRow>(`
    SELECT
      s.id_servidor::text,
      s.codigo_publico,
      s.nome_interno,
      COALESCE(ss.saldo_atual, 0)               AS saldo_atual,
      COALESCE(ss.atualizado_em::text, NOW()::text) AS atualizado_em,
      COALESCE(ss.exibir_saldo, true)           AS exibir_saldo
    FROM public.servidores s
    LEFT JOIN public.saldo_servidor ss ON ss.id_servidor = s.id_servidor
    WHERE s.ativo = true
      AND EXISTS (
        SELECT 1 FROM public.consumo_servidor cs WHERE cs.id_servidor = s.id_servidor
      )
    ORDER BY s.codigo_publico ASC
  `);
  return rows;
}

/**
 * Calcula a data estimada de esgotamento de créditos para cada servidor,
 * usando o padrão de consumo mensal recorrente (por dia do mês).
 */
export async function getPrevisaoEsgotamento(): Promise<PrevisaoRow[]> {
  const { rows } = await pool.query<PrevisaoRow>(`
    WITH consumo_por_dia AS (
      SELECT
        cs.id_servidor,
        EXTRACT(DAY FROM a.venc_contas)::int AS dia_mes,
        SUM(cs.creditos_mensal)              AS creditos_dia
      FROM public.assinaturas a
      JOIN public.consumo_servidor cs ON cs.id_pacote = a.id_pacote
      WHERE a.status IN ('ativo', 'atrasado')
      GROUP BY cs.id_servidor, EXTRACT(DAY FROM a.venc_contas)
    ),
    datas AS (
      SELECT generate_series(
        CURRENT_DATE,
        CURRENT_DATE + INTERVAL '24 months',
        INTERVAL '1 day'
      )::date AS data
    ),
    projecao AS (
      SELECT
        c.id_servidor,
        d.data,
        SUM(c.creditos_dia) OVER (
          PARTITION BY c.id_servidor
          ORDER BY d.data
        ) AS acumulado
      FROM consumo_por_dia c
      JOIN datas d ON EXTRACT(DAY FROM d.data) = c.dia_mes
    )
    SELECT
      p.id_servidor::text,
      MIN(p.data)::text AS data_esgotamento
    FROM projecao p
    JOIN public.saldo_servidor ss ON ss.id_servidor = p.id_servidor
    WHERE p.acumulado > ss.saldo_atual
    GROUP BY p.id_servidor
  `);
  return rows;
}

/**
 * Retorna o consumo mensal total por servidor (soma de todas as assinaturas ativas).
 */
export async function getConsumoMensal(): Promise<ConsumoMensalRow[]> {
  const { rows } = await pool.query<ConsumoMensalRow>(`
    SELECT
      cs.id_servidor::text,
      SUM(cs.creditos_mensal)::int AS creditos_mensal
    FROM public.assinaturas a
    JOIN public.consumo_servidor cs ON cs.id_pacote = a.id_pacote
    WHERE a.status IN ('ativo', 'atrasado')
    GROUP BY cs.id_servidor
  `);
  return rows;
}

export async function getHistoricoSaldo(
  idServidor: string,
  limite = 20
): Promise<SaldoHistoricoRow[]> {
  const { rows } = await pool.query<SaldoHistoricoRow>(
    `SELECT
      id_historico::text,
      tipo,
      quantidade,
      saldo_anterior,
      saldo_novo,
      observacao,
      id_assinatura::text,
      criado_em::text
    FROM public.saldo_servidor_historico
    WHERE id_servidor = $1::bigint
    ORDER BY criado_em DESC
    LIMIT $2`,
    [idServidor, limite]
  );
  return rows;
}

/**
 * Abate créditos ao renovar uma assinatura.
 * Só abate se a nova venc_contas for pelo menos 15 dias maior que a anterior.
 * Deve ser chamado dentro de uma transação existente.
 */
export async function abaterCreditoRenovacao(
  client: any,
  idAssinatura: string,
  vencContasAnterior?: string | null,
  vencContasNova?: string | null
): Promise<void> {
  if (vencContasAnterior && vencContasNova) {
    const anterior = new Date(vencContasAnterior);
    const nova = new Date(vencContasNova);
    anterior.setHours(0, 0, 0, 0);
    nova.setHours(0, 0, 0, 0);
    const diffDias = Math.round(
      (nova.getTime() - anterior.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diffDias < 15) return;
  }

  const { rows } = await client.query(
    `SELECT cs.id_servidor, cs.creditos_mensal
     FROM public.assinaturas a
     JOIN public.consumo_servidor cs ON cs.id_pacote = a.id_pacote
     WHERE a.id_assinatura = $1::bigint`,
    [idAssinatura]
  );

  if (rows.length === 0) return;

  const { id_servidor, creditos_mensal } = rows[0];

  await client.query(
    `INSERT INTO public.saldo_servidor (id_servidor, saldo_atual)
     VALUES ($1, 0)
     ON CONFLICT (id_servidor) DO NOTHING`,
    [id_servidor]
  );

  const { rows: saldoRows } = await client.query(
    `SELECT saldo_atual FROM public.saldo_servidor WHERE id_servidor = $1 FOR UPDATE`,
    [id_servidor]
  );

  const saldoAnterior: number = saldoRows[0]?.saldo_atual ?? 0;
  const saldoNovo = saldoAnterior - creditos_mensal;

  await client.query(
    `UPDATE public.saldo_servidor
     SET saldo_atual = $1, atualizado_em = NOW()
     WHERE id_servidor = $2`,
    [saldoNovo, id_servidor]
  );

  await client.query(
    `INSERT INTO public.saldo_servidor_historico
     (id_servidor, tipo, quantidade, saldo_anterior, saldo_novo, observacao, id_assinatura)
     VALUES ($1, 'abatimento', $2, $3, $4, 'Renovação automática', $5::bigint)`,
    [id_servidor, -creditos_mensal, saldoAnterior, saldoNovo, idAssinatura]
  );
}