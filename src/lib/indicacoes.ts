import { pool } from "@/lib/db";

export type IndicacaoRow = {
  id_indicacao: string;
  id_parceiro: string;
  id_indicado: string;
  bonificacao: "aberta" | "cortesia" | "comissao";
  criado_em: string | null;
  nome_indicado: string | null;
  telefone_indicado: string | null;
  plano_tipo: string | null;
  plano_meses: number | null;
  status_assinatura: string | null;
  venc_contrato: string | null;
};

export async function getIndicacoesByParceiroId(id_parceiro: string): Promise<IndicacaoRow[]> {
  const { rows } = await pool.query<IndicacaoRow>(
    `
    SELECT
      i.id_indicacao::text            AS id_indicacao,
      i.id_parceiro::text             AS id_parceiro,
      i.id_indicado::text             AS id_indicado,
      i.bonificacao,
      i.criado_em::text               AS criado_em,
      c.nome                          AS nome_indicado,
      (
        SELECT ct.telefone::text
        FROM public.contatos ct
        WHERE ct.id_cliente = i.id_indicado
          AND ct.telefone IS NOT NULL
          AND btrim(ct.telefone) <> ''
        ORDER BY ct.atualizado_em DESC NULLS LAST, ct.criado_em DESC NULLS LAST
        LIMIT 1
      )                               AS telefone_indicado,
      pl.tipo::text                   AS plano_tipo,
      pl.meses::int                   AS plano_meses,
      a.status                        AS status_assinatura,
      (
        SELECT MAX(a3.venc_contrato)::text
        FROM public.assinaturas a3
        WHERE a3.id_cliente = i.id_indicado
      )                               AS venc_contrato
    FROM public.indicacoes i
    LEFT JOIN public.clientes c ON c.id_cliente = i.id_indicado
    LEFT JOIN LATERAL (
      SELECT a2.status, a2.id_plano
      FROM public.assinaturas a2
      WHERE a2.id_cliente = i.id_indicado
      ORDER BY
        CASE WHEN lower(btrim(a2.status)) IN ('ativo', 'pendente') THEN 0 ELSE 1 END,
        a2.venc_contrato DESC NULLS LAST
      LIMIT 1
    ) a ON true
    LEFT JOIN public.planos pl ON pl.id_plano = a.id_plano
    WHERE i.id_parceiro = $1::bigint
    ORDER BY venc_contrato DESC
    `,
    [id_parceiro]
  );
  return rows;
}

export type IndicacoesStats = {
  total: number;
  abertas: number;
  comissao: number;
};

export async function getIndicacoesStatsByParceiroId(id_parceiro: string): Promise<IndicacoesStats> {
  const { rows } = await pool.query<IndicacoesStats>(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE bonificacao = 'aberta')::int AS abertas,
      COUNT(*) FILTER (
        WHERE bonificacao = 'comissao'
        AND EXISTS (
          SELECT 1 FROM public.assinaturas a
          WHERE a.id_cliente = i.id_indicado
            AND lower(btrim(a.status)) IN ('ativo', 'atrasado')
        )
      )::int AS comissao
    FROM public.indicacoes i
    WHERE id_parceiro = $1::bigint
    `,
    [id_parceiro]
  );
  return rows[0] ?? { total: 0, abertas: 0, comissao: 0 };
}

export type ParceiroRow = {
  id_parceiro: string;
  nome_parceiro: string | null;
};

export async function getParceiroByIndicadoId(id_indicado: string): Promise<ParceiroRow | null> {
  const { rows } = await pool.query<ParceiroRow>(
    `SELECT i.id_parceiro::text, c.nome AS nome_parceiro
     FROM public.indicacoes i
     LEFT JOIN public.clientes c ON c.id_cliente = i.id_parceiro
     WHERE i.id_indicado = $1::bigint
     LIMIT 1`,
    [id_indicado]
  );
  return rows[0] ?? null;
}

export type ParceiroCortesiaRow = {
  id_parceiro: string;
  nome_parceiro: string | null;
  total_abertas: number;
  id_assinatura_parceiro: string | null;
  venc_contrato_parceiro: string | null;
  venc_contas_parceiro: string | null;
  pacote_nome_parceiro: string | null; 
  indicados: {
    id_indicacao: string;
    id_indicado: string;
    nome_indicado: string | null;
    status_assinatura: string | null;
    plano_tipo: string | null;
    pacote_nome: string | null;
    venc_contrato: string | null;
    pacote_nome_parceiro: string | null;
  }[];
};

export async function getParceirosComCortesiaPendente(): Promise<ParceiroCortesiaRow[]> {
  // Busca parceiros com 2+ indicações abertas
  const { rows: parceiros } = await pool.query(`
    SELECT
      i.id_parceiro::text,
      c.nome AS nome_parceiro,
      COUNT(*)::int AS total_abertas,
      (
        SELECT a.id_assinatura::text
        FROM public.assinaturas a
        WHERE a.id_cliente = i.id_parceiro
          AND lower(btrim(a.status)) IN ('ativo','atrasado','pendente')
        ORDER BY a.venc_contrato DESC NULLS LAST
        LIMIT 1
      ) AS id_assinatura_parceiro,
      (
        SELECT a.venc_contrato::text
        FROM public.assinaturas a
        WHERE a.id_cliente = i.id_parceiro
          AND lower(btrim(a.status)) IN ('ativo','atrasado','pendente')
        ORDER BY a.venc_contrato DESC NULLS LAST
        LIMIT 1
      ) AS venc_contrato_parceiro,
      (
        SELECT a.venc_contas::text
        FROM public.assinaturas a
        WHERE a.id_cliente = i.id_parceiro
          AND lower(btrim(a.status)) IN ('ativo','atrasado','pendente')
        ORDER BY a.venc_contrato DESC NULLS LAST
        LIMIT 1
      ) AS venc_contas_parceiro,
       (
  SELECT pac.contrato::text
  FROM public.assinaturas a
  LEFT JOIN public.pacote pac ON pac.id_pacote = a.id_pacote
  WHERE a.id_cliente = i.id_parceiro
    AND lower(btrim(a.status)) IN ('ativo','atrasado','pendente')
  ORDER BY a.venc_contrato DESC NULLS LAST
  LIMIT 1
) AS pacote_nome_parceiro
    FROM public.indicacoes i
    LEFT JOIN public.clientes c ON c.id_cliente = i.id_parceiro
    WHERE i.bonificacao = 'aberta'
    GROUP BY i.id_parceiro, c.nome
    HAVING COUNT(*) >= 2
    ORDER BY COUNT(*) DESC, c.nome ASC
  `);

  if (parceiros.length === 0) return [];

  // Busca indicados de cada parceiro
  const idsParceiros = parceiros.map((p: any) => p.id_parceiro);
  const { rows: indicados } = await pool.query(`
    SELECT
      i.id_indicacao::text,
      i.id_parceiro::text,
      i.id_indicado::text,
      c.nome AS nome_indicado,
      a.status AS status_assinatura,
      pl.tipo AS plano_tipo,
      pac.contrato AS pacote_nome,
      (
        SELECT MAX(a2.venc_contrato)::text
        FROM public.assinaturas a2
        WHERE a2.id_cliente = i.id_indicado
      ) AS venc_contrato
    FROM public.indicacoes i
    LEFT JOIN public.clientes c ON c.id_cliente = i.id_indicado
    LEFT JOIN LATERAL (
      SELECT a3.status, a3.id_plano, a3.id_pacote
      FROM public.assinaturas a3
      WHERE a3.id_cliente = i.id_indicado
      ORDER BY
        CASE WHEN lower(btrim(a3.status)) IN ('ativo','pendente') THEN 0 ELSE 1 END,
        a3.venc_contrato DESC NULLS LAST
      LIMIT 1
    ) a ON true
    LEFT JOIN public.planos pl ON pl.id_plano = a.id_plano
    LEFT JOIN public.pacote pac ON pac.id_pacote = a.id_pacote
    WHERE i.id_parceiro = ANY($1::bigint[])
      AND i.bonificacao = 'aberta'
    ORDER BY i.id_indicacao ASC
  `, [idsParceiros]);

  // Agrupa indicados por parceiro
  return parceiros.map((p: any) => ({
    ...p,
    indicados: indicados.filter((ind: any) => ind.id_parceiro === p.id_parceiro),
  }));
}