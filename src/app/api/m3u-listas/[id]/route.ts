// src/app/api/m3u-listas/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'

// PATCH /api/m3u-listas/[id]
// Atualiza nome, ativo, intervalo, indexar_conteudo
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()

    const permitidos = [
      'nome', 'url_m3u', 'tipo', 'host', 'usuario', 'senha',
      'porta', 'ativo', 'indexar_conteudo', 'intervalo_teste_min',
    ]

    const campos: string[] = []
    const valores: unknown[] = []
    let idx = 1

    for (const campo of permitidos) {
      if (campo in body) {
        campos.push(`${campo} = $${idx}`)
        valores.push(body[campo])
        idx++
      }
    }

    if (campos.length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 })
    }

    campos.push(`atualizado_em = NOW()`)
    valores.push(id)

    const { rows } = await pool.query(
      `UPDATE m3u_listas SET ${campos.join(', ')}
       WHERE id = $${idx}
       RETURNING *`,
      valores
    )

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Lista não encontrada' }, { status: 404 })
    }

    return NextResponse.json(rows[0])
  } catch (err) {
    console.error('[m3u-listas] PATCH error:', err)
    return NextResponse.json({ error: 'Erro ao atualizar lista' }, { status: 500 })
  }
}

// DELETE /api/m3u-listas/[id]
// Remove lista e todos os dados relacionados (CASCADE)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { rowCount } = await pool.query(
      'DELETE FROM m3u_listas WHERE id = $1',
      [id]
    )

    if (rowCount === 0) {
      return NextResponse.json({ error: 'Lista não encontrada' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[m3u-listas] DELETE error:', err)
    return NextResponse.json({ error: 'Erro ao remover lista' }, { status: 500 })
  }
}