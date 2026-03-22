import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctx.params;

    const { rows: assinaturas } = await pool.query(`
      WITH pgtos AS (
        SELECT
          a.id_assinatura,
          a.status,
          a.criado_em::date AS inicio,
          a.venc_contrato::date AS fim,
          p.data_pgto::date AS data_pgto,
          LAG(p.data_pgto::date) OVER (
            PARTITION BY a.id_assinatura ORDER BY p.data_pgto
          ) AS pgto_anterior
        FROM public.assinaturas a
        JOIN public.pagamentos p
          ON p.id_cliente = a.id_cliente
          AND lower(btrim(p.tipo)) = 'assinatura tv'
          AND p.data_pgto::date BETWEEN a.criado_em::date AND a.venc_contrato::date
        WHERE a.id_cliente = $1::bigint
      )
      SELECT
        id_assinatura,
        status,
        inicio,
        fim,
        MIN(data_pgto) AS primeiro_pgto,
        MAX(data_pgto) AS ultimo_pgto,
        COUNT(*) AS total_pgtos,
        ROUND((fim - MIN(data_pgto)) / 30.0) AS meses_esperados,
        ROUND(
          100.0 * COUNT(*) /
          NULLIF(ROUND((fim - MIN(data_pgto)) / 30.0), 0)
        )::numeric AS cobertura_pct,
        (fim - MAX(data_pgto)) AS dias_sem_pagar_ate_fim,
        ROUND(STDDEV((data_pgto - pgto_anterior))::numeric, 0) AS desvio_dias,
        MAX(data_pgto - pgto_anterior) AS maior_gap
      FROM pgtos
      GROUP BY id_assinatura, status, inicio, fim
      ORDER BY inicio ASC
    `, [id]);

    const { rows: geral } = await pool.query(`
      SELECT
        c.nome,
        c.score_fidelidade,
        COUNT(p.id) AS total_pagamentos,
        MIN(p.data_pgto::date) AS primeiro_pgto,
        MAX(p.data_pgto::date) AS ultimo_pgto,
        ROUND(AVG(p.valor::numeric) FILTER (WHERE p.valor::numeric > 0), 2) AS ticket_medio,
        COUNT(p.id) FILTER (WHERE p.valor::numeric = 0) AS cortesias
      FROM public.clientes c
      LEFT JOIN public.pagamentos p
        ON p.id_cliente = c.id_cliente
        AND lower(btrim(p.tipo)) = 'assinatura tv'
      WHERE c.id_cliente = $1::bigint
      GROUP BY c.id_cliente, c.nome, c.score_fidelidade
    `, [id]);

    const { rows: recente } = await pool.query(`
      WITH pgtos_recentes AS (
        SELECT
          p.data_pgto::date AS data_pgto,
          p.valor::numeric AS valor,
          LAG(p.data_pgto::date) OVER (ORDER BY p.data_pgto) AS pgto_anterior
        FROM public.pagamentos p
        WHERE p.id_cliente = $1::bigint
          AND lower(btrim(p.tipo)) = 'assinatura tv'
          AND p.data_pgto::date >= CURRENT_DATE - INTERVAL '12 months'
        ORDER BY p.data_pgto
      )
      SELECT
        COUNT(*) AS total_pgtos_12m,
        ROUND(AVG(valor) FILTER (WHERE valor > 0), 2) AS ticket_medio_12m,
        ROUND(AVG(data_pgto - pgto_anterior)::numeric, 0) AS media_intervalo_12m,
        ROUND(STDDEV((data_pgto - pgto_anterior))::numeric, 0) AS desvio_12m,
        MAX(data_pgto - pgto_anterior) AS maior_gap_12m,
        MIN(data_pgto) AS primeiro_pgto_12m,
        MAX(data_pgto) AS ultimo_pgto_12m,
        COUNT(*) FILTER (WHERE valor = 0) AS cortesias_12m,
        COUNT(*) FILTER (WHERE (data_pgto - pgto_anterior) > 45) AS pgtos_atrasados_12m
      FROM pgtos_recentes
    `, [id]);

    const cliente = geral[0];
    if (!cliente) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }

    const r = recente[0];

    const contexto = `
Cliente: ${cliente.nome}
Total de pagamentos (histórico completo): ${cliente.total_pagamentos}
Primeiro pagamento: ${cliente.primeiro_pgto}
Último pagamento: ${cliente.ultimo_pgto}
Ticket médio geral: R$ ${cliente.ticket_medio}
Cortesias recebidas: ${cliente.cortesias}

=== ÚLTIMOS 12 MESES (análise prioritária) ===
Pagamentos realizados: ${r.total_pgtos_12m}
Ticket médio: R$ ${r.ticket_medio_12m}
Intervalo médio entre pagamentos: ${r.media_intervalo_12m} dias
Desvio padrão dos intervalos: ${r.desvio_12m} dias
Maior gap: ${r.maior_gap_12m} dias
Pagamentos atrasados (>45 dias): ${r.pgtos_atrasados_12m}
Cortesias no período: ${r.cortesias_12m}
Período: ${r.primeiro_pgto_12m} a ${r.ultimo_pgto_12m}

=== HISTÓRICO COMPLETO POR ASSINATURA ===
${assinaturas.map((a: any, i: number) => `
Assinatura ${i + 1} (ID ${a.id_assinatura}):
- Status: ${a.status}
- Período: ${a.inicio} a ${a.fim}
- Pagamentos: ${a.total_pgtos} de ${a.meses_esperados} meses esperados (${a.cobertura_pct}% cobertura)
- Desvio entre pagamentos: ${a.desvio_dias} dias
- Maior gap: ${a.maior_gap} dias
- Dias sem pagar até o fim: ${a.status !== 'ativo' ? a.dias_sem_pagar_ate_fim + ' dias' : 'assinatura ativa'}
`).join('')}
`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 700,
      messages: [{
        role: "user",
        content: `Você é um assistente de análise de clientes de um serviço de IPTV. Com base nos dados abaixo, escreva um resumo em 4 parágrafos:

1. Comportamento nos últimos 12 meses — seja detalhado e analítico aqui, é a parte mais importante
2. Tendência observada — está melhorando, piorando ou estável?
3. Pontos do histórico completo que merecem destaque
4. Conclusão geral sobre o perfil do cliente

Seja direto, use linguagem informal mas profissional. Não mencione o score numérico diretamente.

${contexto}`
      }]
    });

    const resumo = response.content[0].type === "text" ? response.content[0].text : "";

    return NextResponse.json({
      resumo,
      metricas: {
        total_pagamentos: cliente.total_pagamentos,
        primeiro_pgto: cliente.primeiro_pgto,
        ultimo_pgto: cliente.ultimo_pgto,
        ticket_medio: cliente.ticket_medio,
        cortesias: cliente.cortesias,
        recente: {
          total_pgtos_12m: r.total_pgtos_12m,
          ticket_medio_12m: r.ticket_medio_12m,
          media_intervalo_12m: r.media_intervalo_12m,
          desvio_12m: r.desvio_12m,
          maior_gap_12m: r.maior_gap_12m,
          pgtos_atrasados_12m: r.pgtos_atrasados_12m,
          cortesias_12m: r.cortesias_12m,
          primeiro_pgto_12m: r.primeiro_pgto_12m,
          ultimo_pgto_12m: r.ultimo_pgto_12m,
        },
        assinaturas: assinaturas.map((a: any) => ({
          id_assinatura: a.id_assinatura,
          status: a.status,
          inicio: a.inicio,
          fim: a.fim,
          total_pgtos: a.total_pgtos,
          meses_esperados: a.meses_esperados,
          cobertura_pct: a.cobertura_pct,
          desvio_dias: a.desvio_dias,
          maior_gap: a.maior_gap,
          dias_sem_pagar_ate_fim: a.dias_sem_pagar_ate_fim,
        }))
      }
    });

  } catch (err: any) {
    console.error("Erro score-resumo:", err);
    return NextResponse.json({ error: err.message ?? "Erro interno" }, { status: 500 });
  }
}
