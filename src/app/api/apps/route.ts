import { NextResponse } from 'next/server'
import { getApps } from '@/lib/aplicativos'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const apps = await getApps()
    return NextResponse.json(apps)
  } catch (err) {
    console.error('[apps] Erro ao buscar apps:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
