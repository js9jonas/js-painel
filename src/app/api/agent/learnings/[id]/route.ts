// src/app/api/agent/learnings/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { pool } from '@/lib/db'

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  if (!session?.user || role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = await req.json()

  const campos: string[] = []
  const values: unknown[] = []

  if (body.ativo !== undefined)   { campos.push(`ativo = $${campos.length + 1}`);   values.push(body.ativo) }
  if (body.conteudo !== undefined) { campos.push(`conteudo = $${campos.length + 1}`); values.push(body.conteudo) }

  if (campos.length === 0) return NextResponse.json({ ok: false, error: 'Nenhum campo' }, { status: 400 })

  values.push(id)
  const { rowCount } = await pool.query(
    `UPDATE lab.agente_dados_aprendizados SET ${campos.join(', ')} WHERE id = $${values.length}`,
    values
  )
  return NextResponse.json({ ok: (rowCount ?? 0) > 0 })
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  if (!session?.user || role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await ctx.params
  const { rowCount } = await pool.query(
    `DELETE FROM lab.agente_dados_aprendizados WHERE id = $1`,
    [id]
  )
  return NextResponse.json({ ok: (rowCount ?? 0) > 0 })
}
