import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { transcribeAudio } from '@/lib/transcribe'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { msgId } = await req.json() as { msgId?: number }
  if (!msgId) return NextResponse.json({ error: 'msgId obrigatório' }, { status: 400 })

  const result = await transcribeAudio(msgId)
  if (!result.ok) {
    console.error(`[transcrever] erro msgId=${msgId}: ${result.error}`)
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ transcricao: result.transcricao })
}
