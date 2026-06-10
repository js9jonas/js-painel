import { NextRequest, NextResponse } from 'next/server'
import { getContasPainelByClienteId } from '@/lib/clientes'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const contas = await getContasPainelByClienteId(id)
  return NextResponse.json(contas)
}
