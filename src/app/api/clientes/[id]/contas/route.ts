import { NextRequest, NextResponse } from 'next/server'
import { getContasPainelByClienteId } from '@/lib/clientes'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const contas = await getContasPainelByClienteId(id)
  return NextResponse.json(contas)
}
