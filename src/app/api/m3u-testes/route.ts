// src/app/api/m3u-testes/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { testarLista, testarListaRapido } from '@/lib/m3u-tester'

// POST /api/m3u-testes
// Body: { lista_id: number, rapido?: boolean }
export async function POST(req: NextRequest) {
  try {
    const { lista_id, rapido = false } = await req.json()

    if (!lista_id) {
      return NextResponse.json({ error: 'lista_id é obrigatório' }, { status: 400 })
    }

    const resultado = rapido
      ? await testarListaRapido(lista_id)
      : await testarLista(lista_id)

    return NextResponse.json(resultado)
  } catch (err) {
    console.error('[m3u-testes] POST error:', err)
    return NextResponse.json({ error: 'Erro ao executar teste' }, { status: 500 })
  }
}