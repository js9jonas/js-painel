// src/app/api/m3u-listas/[id]/canais/route.ts
// GET /api/m3u-listas/[id]/canais?busca=telecine
// Busca canais ao vivo na API Xtream para configurar canal de teste
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'

function extrairCredenciais(urlM3u: string) {
  try {
    const url = new URL(urlM3u)
    const username = url.searchParams.get('username')
    const password = url.searchParams.get('password')
    const host = `${url.protocol}//${url.host}`
    if (username && password) return { host, username, password }
  } catch {}
  return null
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const busca = req.nextUrl.searchParams.get('busca') ?? ''

    const { rows } = await pool.query(
      'SELECT url_m3u, tipo, host, usuario, senha FROM m3u_listas WHERE id = $1',
      [id]
    )
    if (rows.length === 0) return NextResponse.json({ error: 'Lista não encontrada' }, { status: 404 })

    const lista = rows[0]
    const creds =
      lista.tipo === 'xtream' && lista.host && lista.usuario && lista.senha
        ? { host: lista.host, username: lista.usuario, password: lista.senha }
        : extrairCredenciais(lista.url_m3u)

    if (!creds) return NextResponse.json({ error: 'Credenciais não encontradas' }, { status: 400 })

    const url = `${creds.host}/player_api.php?username=${creds.username}&password=${creds.password}&action=get_live_streams`
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return NextResponse.json({ error: 'Erro ao buscar canais' }, { status: 502 })

    const canais = await res.json() as Array<{ stream_id: number; name: string; category_name?: string }>

    const filtrados = busca
      ? canais.filter(c => c.name.toLowerCase().includes(busca.toLowerCase()))
      : canais.slice(0, 20)

    return NextResponse.json(
      filtrados.slice(0, 50).map(c => ({
        stream_id: c.stream_id,
        nome: c.name,
        categoria: c.category_name ?? '',
      }))
    )
  } catch (err) {
    console.error('[canais] GET error:', err)
    return NextResponse.json({ error: 'Erro ao buscar canais' }, { status: 500 })
  }
}