import { NextRequest, NextResponse } from 'next/server'
import { getPagamentos } from '@/lib/pagamentos'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  try {
    const pagamentos = await getPagamentos({ id_cliente: id, pageSize: 20 })
    return NextResponse.json(pagamentos)
  } catch (err) {
    console.error('[pagamentos] Erro ao buscar pagamentos:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
