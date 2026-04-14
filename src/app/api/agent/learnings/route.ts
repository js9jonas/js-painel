// src/app/api/agent/learnings/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { pool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  if (!session?.user || role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { rows } = await pool.query(`
    SELECT id, categoria, conteudo, pergunta_origem, ativo, criado_em
    FROM lab.agente_dados_aprendizados
    ORDER BY criado_em DESC
  `)
  return NextResponse.json(rows)
}
