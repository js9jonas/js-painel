import { NextRequest, NextResponse } from 'next/server'
import { getAplicativosByClienteId } from '@/lib/aplicativos'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  try {
    const aplicativos = await getAplicativosByClienteId(id)
    return NextResponse.json(aplicativos)
  } catch (err) {
    console.error('[aplicativos] Erro ao buscar aplicativos:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
