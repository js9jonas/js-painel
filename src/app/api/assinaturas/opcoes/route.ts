import { NextResponse } from 'next/server'
import { getPlanos } from '@/lib/planos'
import { getPacotes } from '@/lib/pacotes'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const [planos, pacotes] = await Promise.all([getPlanos(), getPacotes()])
  return NextResponse.json({ planos, pacotes })
}
