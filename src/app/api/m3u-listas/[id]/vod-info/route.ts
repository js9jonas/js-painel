// src/app/api/m3u-listas/[id]/vod-info/route.ts
// GET /api/m3u-listas/[id]/vod-info?id=<vod_id>
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'

const UA = 'Lavf/58.76.100'

function extrairCreds(lista: { tipo: string; host: string | null; usuario: string | null; senha: string | null; url_m3u: string }) {
  if (lista.tipo === 'xtream' && lista.host && lista.usuario && lista.senha) {
    return { host: lista.host, username: lista.usuario, password: lista.senha }
  }
  try {
    const u = new URL(lista.url_m3u)
    const username = u.searchParams.get('username')
    const password = u.searchParams.get('password')
    if (username && password) return { host: `${u.protocol}//${u.host}`, username, password }
  } catch {}
  return null
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const vodId = req.nextUrl.searchParams.get('id')
    if (!vodId) return NextResponse.json({ error: 'id é obrigatório' }, { status: 400 })

    const { rows } = await pool.query(
      'SELECT tipo, host, usuario, senha, url_m3u FROM m3u_listas WHERE id = $1',
      [id]
    )
    if (!rows.length) return NextResponse.json({ error: 'Lista não encontrada' }, { status: 404 })

    const creds = extrairCreds(rows[0])
    if (!creds) return NextResponse.json({ error: 'Credenciais não encontradas' }, { status: 400 })

    const apiUrl = `${creds.host}/player_api.php?username=${creds.username}&password=${creds.password}&action=get_vod_info&vod_id=${vodId}`

    const upstream = await fetch(apiUrl, {
      signal: AbortSignal.timeout(15_000),
      headers: { 'User-Agent': UA },
      cache: 'no-store',
    })

    if (!upstream.ok) {
      return NextResponse.json({ error: `Upstream HTTP ${upstream.status}` }, { status: 502 })
    }

    const data = await upstream.json()
    const info = data?.info ?? {}
    const movie = data?.movie_data ?? {}

    const ext = movie.container_extension ?? info.container_extension ?? 'mp4'
    const streamId = movie.stream_id ?? vodId

    return NextResponse.json({
      nome: info.name ?? movie.name ?? '',
      capa: info.cover_big ?? info.movie_image ?? info.cover ?? '',
      sinopse: info.plot ?? '',
      genero: info.genre ?? '',
      ano: info.releasedate ?? info.year ?? '',
      rating: info.rating ?? info.rating_5based ?? '',
      elenco: info.cast ?? '',
      duracao: info.duration ?? '',
      diretor: info.director ?? '',
      url: `${creds.host}/movie/${creds.username}/${creds.password}/${streamId}.${ext}`,
    })
  } catch (err) {
    console.error('[vod-info] GET error:', err)
    return NextResponse.json({ error: 'Erro ao buscar detalhes' }, { status: 500 })
  }
}
