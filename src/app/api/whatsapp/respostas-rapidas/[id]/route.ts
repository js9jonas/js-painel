import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { id } = await params
  const { atalho, titulo, texto, ordem, ativo } = await req.json()
  const { rows } = await pool.query(
    `UPDATE public.respostas_rapidas
     SET atalho = $1, titulo = $2, texto = $3, ordem = $4, ativo = $5
     WHERE id = $6
     RETURNING id, atalho, titulo, texto, ordem, ativo`,
    [atalho?.trim().toLowerCase(), titulo?.trim(), texto?.trim(), ordem ?? 0, ativo ?? true, id]
  )
  if (!rows[0]) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 })
  return NextResponse.json(rows[0])
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  const { id } = await params
  await pool.query(`DELETE FROM public.respostas_rapidas WHERE id = $1`, [id])
  return NextResponse.json({ ok: true })
}
