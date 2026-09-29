import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { lerImagemApp } from '@/lib/ler-imagem-app'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  // O /chat manda o id como string (bigint do Postgres vira texto no node-postgres)
  const { msgId: bruto } = await req.json().catch(() => ({})) as { msgId?: number | string }
  const msgId = Number(bruto)
  if (!Number.isSafeInteger(msgId) || msgId <= 0) return NextResponse.json({ error: 'msgId obrigatório' }, { status: 400 })

  const result = await lerImagemApp(msgId)
  if (!result.ok) {
    console.error(`[ler-imagem] erro msgId=${msgId}: ${result.error}`)
    return NextResponse.json({ error: result.error }, { status: 502 })
  }
  return NextResponse.json(result.leitura)
}
