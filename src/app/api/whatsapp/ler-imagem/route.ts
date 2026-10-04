import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { lerImagemApp, leiturasDaConversa } from '@/lib/ler-imagem-app'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // O /chat manda o id como string (bigint do Postgres vira texto no node-postgres)
  const { msgId: bruto, forcar } = await req.json().catch(() => ({})) as { msgId?: number | string; forcar?: boolean }
  const msgId = Number(bruto)
  if (!Number.isSafeInteger(msgId) || msgId <= 0) return NextResponse.json({ error: 'msgId obrigatório' }, { status: 400 })

  const result = await lerImagemApp(msgId, { forcar: forcar === true })
  if (!result.ok) {
    console.error(`[ler-imagem] erro msgId=${msgId}: ${result.error}`)
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  return NextResponse.json(result.leitura)
}

// Leituras já salvas das imagens de uma conversa (cartões permanentes no /chat)
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const telefone = new URL(req.url).searchParams.get('telefone')
  if (!telefone) return NextResponse.json({ error: 'telefone obrigatório' }, { status: 400 })
  try {
    return NextResponse.json({ leituras: await leiturasDaConversa(telefone) })
  } catch (err) {
    console.error('[ler-imagem] erro ao carregar leituras salvas:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
