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
};

export async function getIndicacoesStatsByParceiroId(id_parceiro: string): Promise<IndicacoesStats> {
  const { rows } = await pool.query<IndicacoesStats>(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE bonificacao = 'aberta')::int AS abertas
    FROM public.indicacoes
    WHERE id_parceiro = $1::bigint
    `,
    [id_parceiro]
  );
  return rows[0] ?? { total: 0, abertas: 0 };
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