import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  try {
    const { telefone } = await req.json()
    if (!telefone) return NextResponse.json({ error: 'telefone obrigatório' }, { status: 400 })

    await pool.query(
      `INSERT INTO public.whatsapp_leituras (telefone, lido_em)
       VALUES ($1, NOW())
       ON CONFLICT (telefone) DO UPDATE SET lido_em = NOW()`,
      [telefone]
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[WhatsApp] Erro ao marcar lida:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
