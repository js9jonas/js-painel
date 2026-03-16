// src/app/api/m3u-resumo/route.ts
// Endpoint chamado pelo n8n semanalmente para compactar os testes

import { NextRequest, NextResponse } from 'next/server'
import { compactarSemana } from '@/lib/m3u-compactador'

// Proteção por token interno (mesmo padrão das outras rotas internas)
function validarToken(req: NextRequest): boolean {
  const token = req.headers.get('x-internal-token')
  return token === process.env.INTERNAL_API_TOKEN
}

// POST /api/m3u-resumo
// Body opcional: { "semana_inicio": "2026-03-10" }  ← para forçar uma semana específica
export async function POST(req: NextRequest) {
  if (!validarToken(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    let semanaInicio: Date | undefined

    const body = await req.json().catch(() => ({}))
    if (body.semana_inicio) {
      semanaInicio = new Date(body.semana_inicio + 'T00:00:00Z')
      if (isNaN(semanaInicio.getTime())) {
        return NextResponse.json({ error: 'semana_inicio inválida. Use formato YYYY-MM-DD' }, { status: 400 })
      }
    }

    console.log('[m3u-resumo] Iniciando compactação semanal...')
    const resultado = await compactarSemana(semanaInicio)

    return NextResponse.json({
      ok: true,
      processadas: resultado.processadas,
      erros: resultado.erros,
      detalhes: resultado.detalhes,
    })
  } catch (err) {
    console.error('[m3u-resumo] Erro:', err)
    return NextResponse.json({ error: 'Erro ao compactar' }, { status: 500 })
  }
}

// GET /api/m3u-resumo
// Retorna os resumos semanais de todas as listas
export async function GET(req: NextRequest) {
  if (!validarToken(req)) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const { pool } = await import('@/lib/db')
    const { rows } = await pool.query(`
      SELECT
        r.*,
        l.nome AS lista_nome
      FROM m3u_resumos_semanais r
      JOIN m3u_listas l ON l.id = r.lista_id
      ORDER BY r.semana_inicio DESC, l.nome ASC
    `)
    return NextResponse.json(rows)
  } catch (err) {
    console.error('[m3u-resumo] GET error:', err)
    return NextResponse.json({ error: 'Erro ao buscar resumos' }, { status: 500 })
  }
}