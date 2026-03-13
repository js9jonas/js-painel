// src/app/api/m3u-testes/historico/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'

// GET /api/m3u-testes/historico?horas=24
// Retorna dados agregados para gráficos comparativos
export async function GET(req: NextRequest) {
  const horas = parseInt(req.nextUrl.searchParams.get('horas') ?? '24')

  try {
    // 1. Médias por servidor (para barras comparativas)
    const { rows: medias } = await pool.query(`
      SELECT
        l.id,
        l.nome,
        ROUND(AVG(t.ping_ms))            AS ping_medio,
        ROUND(AVG(t.ttfb_ms))            AS ttfb_medio,
        ROUND(AVG(t.jitter_ms))          AS jitter_medio,
        ROUND(AVG(t.velocidade_kbps))    AS velocidade_media,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE t.status = 'online')
               / NULLIF(COUNT(*), 0), 1
        )                                AS uptime_pct,
        COUNT(*)                         AS total_testes
      FROM m3u_listas l
      JOIN m3u_testes t ON t.lista_id = l.id
      WHERE t.testado_em >= NOW() - ($1 || ' hours')::INTERVAL
        AND t.ping_ms IS NOT NULL
      GROUP BY l.id, l.nome
      ORDER BY l.nome
    `, [horas])

    // 2. Série temporal de ping por servidor (agrupado por hora)
    const { rows: serie } = await pool.query(`
      SELECT
        l.nome,
        date_trunc('hour', t.testado_em) AS hora,
        ROUND(AVG(t.ping_ms))            AS ping_medio,
        ROUND(AVG(t.ttfb_ms))            AS ttfb_medio,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE t.status = 'online')
               / NULLIF(COUNT(*), 0), 1
        )                                AS uptime_pct
      FROM m3u_listas l
      JOIN m3u_testes t ON t.lista_id = l.id
      WHERE t.testado_em >= NOW() - ($1 || ' hours')::INTERVAL
        AND t.ping_ms IS NOT NULL
      GROUP BY l.nome, date_trunc('hour', t.testado_em)
      ORDER BY hora ASC
    `, [horas])

    // 3. Agrupa série temporal por hora (pivot para recharts)
    const horasMap: Record<string, Record<string, number>> = {}
    const servidores = [...new Set(serie.map((r: {nome: string}) => r.nome))]

    for (const row of serie) {
      const horaKey = new Date(row.hora).toLocaleTimeString('pt-BR', {
        hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
      })
      if (!horasMap[horaKey]) horasMap[horaKey] = { hora: horaKey as unknown as number }
      horasMap[horaKey][`${row.nome}_ping`] = Number(row.ping_medio)
      horasMap[horaKey][`${row.nome}_uptime`] = Number(row.uptime_pct)
    }

    // 4. Contagens de conteudo do ultimo snapshot de cada lista
    const { rows: contagens } = await pool.query(`
      SELECT
        l.nome,
        s.total_canais,
        s.total_filmes,
        s.total_series,
        s.total_geral
      FROM m3u_listas l
      JOIN LATERAL (
        SELECT total_canais, total_filmes, total_series, total_geral
        FROM m3u_snapshots
        WHERE lista_id = l.id
        ORDER BY capturado_em DESC
        LIMIT 1
      ) s ON true
      ORDER BY l.nome
    `)

    return NextResponse.json({
      medias,
      serie: Object.values(horasMap),
      servidores,
      periodo_horas: horas,
      contagens,
    })
  } catch (err) {
    console.error('[historico] GET error:', err)
    return NextResponse.json({ error: 'Erro ao buscar histórico' }, { status: 500 })
  }
}