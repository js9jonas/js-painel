// src/lib/m3u-compactador.ts
// Compacta testes da semana anterior em um resumo com análise de IA
// Chamado pelo endpoint /api/m3u-resumo (acionado pelo n8n semanalmente)

import { pool } from '@/lib/db'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface DadosSemana {
  lista_id: number
  nome: string
  semana_inicio: string
  semana_fim: string
  total_testes: number
  total_rapidos: number
  total_completos: number
  uptime_pct: number
  total_online: number
  total_offline: number
  total_timeouts: number
  total_erros: number
  maior_sequencia_offline: number
  ping_medio: number | null
  ping_min: number | null
  ping_max: number | null
  jitter_medio: number | null
  ttfb_medio: number | null
  total_testes_stream: number
  stream_ok_pct: number | null
  stream_lento_pct: number | null
  stream_falhou_pct: number | null
  stream_throughput_medio: number | null
  stream_throughput_min: number | null
  stream_throughput_max: number | null
  stream_consistencia_media: number | null
}

interface ResumoAnterior {
  uptime_pct: number | null
  ping_medio: number | null
  score_medio: number | null
}

interface AnaliseIA {
  classificacao: 'excelente' | 'bom' | 'instavel' | 'ruim'
  pontos_atencao: string[]
  resumo: string
}

// ─── Classificação por regras (fallback se IA falhar) ─────────────────────────

function classificarPorRegras(dados: DadosSemana): 'excelente' | 'bom' | 'instavel' | 'ruim' {
  const uptime = dados.uptime_pct
  const streamOk = dados.stream_ok_pct ?? 0

  if (uptime >= 95 && streamOk >= 80) return 'excelente'
  if (uptime >= 85 && streamOk >= 60) return 'bom'
  if (uptime >= 70) return 'instavel'
  return 'ruim'
}

// ─── Score calculado ──────────────────────────────────────────────────────────
// Pesos:
//   Uptime              35% — disponibilidade do servidor
//   Stream OK %         25% — qualidade real do vídeo entregue
//   Ping                20% — latência de conexão
//   Stream consistência 12% — estabilidade do throughput
//   Jitter               8% — variação do ping

function calcularScore(dados: DadosSemana): number {
  const scoreUptime      = dados.uptime_pct
  const scoreStreamOk    = dados.stream_ok_pct ?? 0
  const scorePing        = Math.max(0, 100 - (dados.ping_medio ?? 999) / 10)
  const scoreConsistencia = dados.stream_consistencia_media ?? 0
  const scoreJitter      = Math.max(0, 100 - (dados.jitter_medio ?? 0) / 5)

  const total =
    scoreUptime       * 0.35 +
    scoreStreamOk     * 0.25 +
    scorePing         * 0.20 +
    scoreConsistencia * 0.12 +
    scoreJitter       * 0.08

  return Math.round(total) / 10
}

// ─── Análise por IA ───────────────────────────────────────────────────────────

async function analisarComIA(dados: DadosSemana, anterior: ResumoAnterior | null): Promise<AnaliseIA> {
  const contexto = `
Servidor IPTV: ${dados.nome}
Período: ${dados.semana_inicio} a ${dados.semana_fim}

DISPONIBILIDADE:
- Total de testes: ${dados.total_testes}
- Uptime: ${dados.uptime_pct}%
- Online: ${dados.total_online} | Offline: ${dados.total_offline} | Timeout: ${dados.total_timeouts} | Erro: ${dados.total_erros}
- Maior sequência de falhas consecutivas: ${dados.maior_sequencia_offline} testes

LATÊNCIA:
- Ping médio: ${dados.ping_medio ?? '—'}ms (min: ${dados.ping_min ?? '—'}ms, max: ${dados.ping_max ?? '—'}ms)
- Jitter médio: ${dados.jitter_medio ?? '—'}ms
- TTFB médio: ${dados.ttfb_medio ?? '—'}ms

STREAM (qualidade real de vídeo):
- Testes com stream: ${dados.total_testes_stream}
- Status OK: ${dados.stream_ok_pct ?? '—'}% | Lento: ${dados.stream_lento_pct ?? '—'}% | Falhou: ${dados.stream_falhou_pct ?? '—'}%
- Throughput médio: ${dados.stream_throughput_medio ?? '—'} kbps (min: ${dados.stream_throughput_min ?? '—'}, max: ${dados.stream_throughput_max ?? '—'})
- Consistência média do stream: ${dados.stream_consistencia_media ?? '—'}%

${anterior ? `COMPARAÇÃO COM SEMANA ANTERIOR:
- Uptime anterior: ${anterior.uptime_pct ?? '—'}%
- Ping anterior: ${anterior.ping_medio ?? '—'}ms
- Score anterior: ${anterior.score_medio ?? '—'}` : 'Primeira semana registrada — sem comparação disponível.'}
`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Você é um analisador de qualidade de servidores IPTV. Analise os dados abaixo e retorne APENAS um JSON válido (sem markdown, sem texto extra) com:
- "classificacao": uma de ["excelente", "bom", "instavel", "ruim"]
- "pontos_atencao": array de 2 a 4 strings curtas em português identificando os principais problemas ou destaques
- "resumo": um parágrafo curto (máximo 2 frases) resumindo a qualidade do servidor na semana

Regras para classificação:
- excelente: uptime >= 95% e stream ok >= 80%
- bom: uptime >= 85% e stream ok >= 60%
- instavel: uptime >= 70%
- ruim: abaixo disso

Dados:
${contexto}`
      }]
    })

    const texto = response.content[0].type === 'text' ? response.content[0].text : ''
    const limpo = texto.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(limpo)

    return {
      classificacao: parsed.classificacao ?? classificarPorRegras(dados),
      pontos_atencao: Array.isArray(parsed.pontos_atencao) ? parsed.pontos_atencao : [],
      resumo: parsed.resumo ?? '',
    }
  } catch (err) {
    console.error('[compactador] Erro na análise IA:', err)
    return {
      classificacao: classificarPorRegras(dados),
      pontos_atencao: [`Uptime de ${dados.uptime_pct}% na semana`],
      resumo: `Servidor com uptime de ${dados.uptime_pct}% e ${dados.total_testes} testes realizados.`,
    }
  }
}

// ─── Maior sequência de falhas consecutivas ───────────────────────────────────

async function calcularMaiorSequenciaOffline(listaId: number, inicio: Date, fim: Date): Promise<number> {
  const { rows } = await pool.query(`
    SELECT status FROM m3u_testes
    WHERE lista_id = $1
      AND testado_em >= $2
      AND testado_em < $3
    ORDER BY testado_em ASC
  `, [listaId, inicio, fim])

  let maior = 0
  let atual = 0
  for (const row of rows) {
    if (row.status !== 'online') {
      atual++
      if (atual > maior) maior = atual
    } else {
      atual = 0
    }
  }
  return maior
}

// ─── Função principal ─────────────────────────────────────────────────────────

export async function compactarSemana(semanaInicio?: Date): Promise<{
  processadas: number
  erros: number
  detalhes: { lista: string; status: string }[]
}> {
  const hoje = new Date()
  const inicio = semanaInicio ?? (() => {
    const d = new Date(hoje)
    d.setDate(d.getDate() - 7)
    d.setHours(0, 0, 0, 0)
    const diaSemana = d.getDay()
    const diasAteLast = diaSemana === 0 ? 6 : diaSemana - 1
    d.setDate(d.getDate() - diasAteLast)
    return d
  })()

  const fim = new Date(inicio)
  fim.setDate(fim.getDate() + 7)

  const semanaInicioStr = inicio.toISOString().split('T')[0]
  const semanaFimStr    = new Date(fim.getTime() - 1).toISOString().split('T')[0]

  console.log(`[compactador] Processando semana ${semanaInicioStr} → ${semanaFimStr}`)

  const { rows: listas } = await pool.query(
    'SELECT id, nome FROM m3u_listas ORDER BY nome'
  )

  let processadas = 0
  let erros = 0
  const detalhes: { lista: string; status: string }[] = []

  for (const lista of listas) {
    try {
      const { rows: existente } = await pool.query(
        'SELECT id FROM m3u_resumos_semanais WHERE lista_id = $1 AND semana_inicio = $2',
        [lista.id, semanaInicioStr]
      )
      if (existente.length > 0) {
        detalhes.push({ lista: lista.nome, status: 'já processada' })
        continue
      }

      const { rows: agg } = await pool.query(`
        SELECT
          COUNT(*)                                                    AS total_testes,
          COUNT(*) FILTER (WHERE velocidade_kbps IS NULL)            AS total_rapidos,
          COUNT(*) FILTER (WHERE velocidade_kbps IS NOT NULL)        AS total_completos,
          ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'online')
                / NULLIF(COUNT(*), 0), 1)                            AS uptime_pct,
          COUNT(*) FILTER (WHERE status = 'online')                  AS total_online,
          COUNT(*) FILTER (WHERE status = 'offline')                 AS total_offline,
          COUNT(*) FILTER (WHERE status = 'timeout')                 AS total_timeouts,
          COUNT(*) FILTER (WHERE status = 'erro')                    AS total_erros,
          ROUND(AVG(ping_ms))                                        AS ping_medio,
          MIN(ping_ms)                                               AS ping_min,
          MAX(ping_ms)                                               AS ping_max,
          ROUND(AVG(jitter_ms))                                      AS jitter_medio,
          ROUND(AVG(ttfb_ms))                                        AS ttfb_medio,
          COUNT(*) FILTER (WHERE stream_status IS NOT NULL)          AS total_testes_stream,
          ROUND(100.0 * COUNT(*) FILTER (WHERE stream_status = 'ok')
                / NULLIF(COUNT(*) FILTER (WHERE stream_status IS NOT NULL), 0), 1) AS stream_ok_pct,
          ROUND(100.0 * COUNT(*) FILTER (WHERE stream_status = 'lento')
                / NULLIF(COUNT(*) FILTER (WHERE stream_status IS NOT NULL), 0), 1) AS stream_lento_pct,
          ROUND(100.0 * COUNT(*) FILTER (WHERE stream_status = 'falhou')
                / NULLIF(COUNT(*) FILTER (WHERE stream_status IS NOT NULL), 0), 1) AS stream_falhou_pct,
          ROUND(AVG(stream_throughput_kbps))                         AS stream_throughput_medio,
          MIN(stream_throughput_kbps)                                AS stream_throughput_min,
          MAX(stream_throughput_kbps)                                AS stream_throughput_max,
          ROUND(AVG(stream_consistencia_pct), 1)                     AS stream_consistencia_media
        FROM m3u_testes
        WHERE lista_id = $1
          AND testado_em >= $2
          AND testado_em < $3
      `, [lista.id, inicio, fim])

      const d = agg[0]
      if (!d || Number(d.total_testes) === 0) {
        detalhes.push({ lista: lista.nome, status: 'sem testes no período' })
        continue
      }

      const maiorSequencia = await calcularMaiorSequenciaOffline(lista.id, inicio, fim)

      const { rows: anterior } = await pool.query(`
        SELECT uptime_pct, ping_medio, score_medio
        FROM m3u_resumos_semanais
        WHERE lista_id = $1
        ORDER BY semana_inicio DESC
        LIMIT 1
      `, [lista.id])
      const resumoAnterior: ResumoAnterior | null = anterior[0] ?? null

      const dadosSemana: DadosSemana = {
        lista_id:                lista.id,
        nome:                    lista.nome,
        semana_inicio:           semanaInicioStr,
        semana_fim:              semanaFimStr,
        total_testes:            Number(d.total_testes),
        total_rapidos:           Number(d.total_rapidos),
        total_completos:         Number(d.total_completos),
        uptime_pct:              Number(d.uptime_pct),
        total_online:            Number(d.total_online),
        total_offline:           Number(d.total_offline),
        total_timeouts:          Number(d.total_timeouts),
        total_erros:             Number(d.total_erros),
        maior_sequencia_offline: maiorSequencia,
        ping_medio:              d.ping_medio   ? Number(d.ping_medio)   : null,
        ping_min:                d.ping_min     ? Number(d.ping_min)     : null,
        ping_max:                d.ping_max     ? Number(d.ping_max)     : null,
        jitter_medio:            d.jitter_medio ? Number(d.jitter_medio) : null,
        ttfb_medio:              d.ttfb_medio   ? Number(d.ttfb_medio)   : null,
        total_testes_stream:     Number(d.total_testes_stream),
        stream_ok_pct:           d.stream_ok_pct           ? Number(d.stream_ok_pct)           : null,
        stream_lento_pct:        d.stream_lento_pct        ? Number(d.stream_lento_pct)        : null,
        stream_falhou_pct:       d.stream_falhou_pct       ? Number(d.stream_falhou_pct)        : null,
        stream_throughput_medio: d.stream_throughput_medio ? Number(d.stream_throughput_medio) : null,
        stream_throughput_min:   d.stream_throughput_min   ? Number(d.stream_throughput_min)   : null,
        stream_throughput_max:   d.stream_throughput_max   ? Number(d.stream_throughput_max)   : null,
        stream_consistencia_media: d.stream_consistencia_media ? Number(d.stream_consistencia_media) : null,
      }

      const score = calcularScore(dadosSemana)

      const uptimeVariacao = resumoAnterior?.uptime_pct != null
        ? Number((dadosSemana.uptime_pct - resumoAnterior.uptime_pct).toFixed(1))
        : null
      const pingVariacao = resumoAnterior?.ping_medio != null && dadosSemana.ping_medio != null
        ? dadosSemana.ping_medio - resumoAnterior.ping_medio
        : null
      const scoreVariacao = resumoAnterior?.score_medio != null
        ? Number((score - Number(resumoAnterior.score_medio)).toFixed(1))
        : null

      const analise = await analisarComIA(dadosSemana, resumoAnterior)

      await pool.query(`
        INSERT INTO m3u_resumos_semanais (
          lista_id, semana_inicio, semana_fim,
          total_testes, total_rapidos, total_completos,
          uptime_pct, total_online, total_offline, total_timeouts, total_erros,
          maior_sequencia_offline,
          ping_medio, ping_min, ping_max, jitter_medio, ttfb_medio,
          total_testes_stream, stream_ok_pct, stream_lento_pct, stream_falhou_pct,
          stream_throughput_medio, stream_throughput_min, stream_throughput_max,
          stream_consistencia_media,
          score_medio, classificacao, pontos_atencao, resumo_ia,
          uptime_variacao, ping_variacao, score_variacao
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
          $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32
        )
      `, [
        lista.id, semanaInicioStr, semanaFimStr,
        dadosSemana.total_testes, dadosSemana.total_rapidos, dadosSemana.total_completos,
        dadosSemana.uptime_pct, dadosSemana.total_online, dadosSemana.total_offline,
        dadosSemana.total_timeouts, dadosSemana.total_erros, maiorSequencia,
        dadosSemana.ping_medio, dadosSemana.ping_min, dadosSemana.ping_max,
        dadosSemana.jitter_medio, dadosSemana.ttfb_medio,
        dadosSemana.total_testes_stream, dadosSemana.stream_ok_pct,
        dadosSemana.stream_lento_pct, dadosSemana.stream_falhou_pct,
        dadosSemana.stream_throughput_medio, dadosSemana.stream_throughput_min,
        dadosSemana.stream_throughput_max, dadosSemana.stream_consistencia_media,
        score, analise.classificacao,
        JSON.stringify(analise.pontos_atencao), analise.resumo,
        uptimeVariacao, pingVariacao, scoreVariacao,
      ])

      const { rowCount } = await pool.query(`
        DELETE FROM m3u_testes
        WHERE lista_id = $1
          AND testado_em >= $2
          AND testado_em < $3
      `, [lista.id, inicio, fim])

      console.log(`[compactador] ${lista.nome}: resumo gravado, ${rowCount} testes deletados`)
      detalhes.push({ lista: lista.nome, status: `ok — ${rowCount} testes compactados` })
      processadas++

    } catch (err) {
      console.error(`[compactador] Erro em ${lista.nome}:`, err)
      detalhes.push({ lista: lista.nome, status: `erro: ${err instanceof Error ? err.message : 'desconhecido'}` })
      erros++
    }
  }

  // Limpa snapshots duplicados do mesmo dia (mantém 1 por dia)
  await pool.query(`
    DELETE FROM m3u_snapshots
    WHERE id NOT IN (
      SELECT DISTINCT ON (lista_id, DATE(capturado_em)) id
      FROM m3u_snapshots
      ORDER BY lista_id, DATE(capturado_em), capturado_em DESC
    )
  `)
  console.log('[compactador] Snapshots duplicados removidos')

  return { processadas, erros, detalhes }
}