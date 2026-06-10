import { NextResponse } from 'next/server'
import { getPlanos } from '@/lib/planos'
import { getPacotes } from '@/lib/pacotes'

export const dynamic = 'force-dynamic'

export async function GET() {
  const [planos, pacotes] = await Promise.all([getPlanos(), getPacotes()])
  return NextResponse.json({ planos, pacotes })
}
