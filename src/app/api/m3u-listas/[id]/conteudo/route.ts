// src/app/api/m3u-listas/[id]/conteudo/route.ts
// GET /api/m3u-listas/[id]/conteudo?tipo=canais|filmes|series|canais-cats|filmes-cats|series-cats&categoria_id=X&busca=Y
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'

const UA = 'Lavf/58.76.100'
const LIMIT = 200

interface Creds { host: string; username: string; password: string }

function extrairCreds(lista: { tipo: string; host: string | null; usuario: string | null; senha: string | null; url_m3u: string }): Creds | null {
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
    const tipo = req.nextUrl.searchParams.get('tipo') ?? 'canais'
    const busca = (req.nextUrl.searchParams.get('busca') ?? '').toLowerCase().trim()
    const categoriaId = req.nextUrl.searchParams.get('categoria_id') ?? ''

    const { rows } = await pool.query(
      'SELECT tipo, host, usuario, senha, url_m3u FROM m3u_listas WHERE id = $1',
      [id]
    )
    if (!rows.length) return NextResponse.json({ error: 'Lista não encontrada' }, { status: 404 })

    const creds = extrairCreds(rows[0])
    if (!creds) return NextResponse.json({ error: 'Credenciais Xtream não encontradas' }, { status: 400 })

    // ── Busca de categorias ────────────────────────────────────────────────────
    if (tipo.endsWith('-cats')) {
      const tipoBase = tipo.replace('-cats', '')
      const action =
        tipoBase === 'filmes' ? 'get_vod_categories' :
        tipoBase === 'series' ? 'get_series_categories' :
        'get_live_categories'

      const apiUrl = `${creds.host}/player_api.php?username=${creds.username}&password=${creds.password}&action=${action}`

      const upstream = await fetch(apiUrl, {
        signal: AbortSignal.timeout(30_000),
        headers: { 'User-Agent': UA },
        cache: 'no-store',
      })

      if (!upstream.ok) return NextResponse.json({ error: `Upstream HTTP ${upstream.status}` }, { status: 502 })

      const data = await upstream.json()
      if (!Array.isArray(data)) return NextResponse.json([])

      type RawCat = { category_id: string; category_name: string }
      const cats = (data as RawCat[])
        .filter(c => c.category_name?.trim())
        .map(c => ({ category_id: String(c.category_id), category_name: c.category_name }))

      return NextResponse.json(cats)
    }

    // ── Busca de conteúdo ──────────────────────────────────────────────────────
    const action =
      tipo === 'filmes' ? 'get_vod_streams' :
      tipo === 'series' ? 'get_series' :
      'get_live_streams'

    let apiUrl = `${creds.host}/player_api.php?username=${creds.username}&password=${creds.password}&action=${action}`
    if (categoriaId) apiUrl += `&category_id=${encodeURIComponent(categoriaId)}`

    const upstream = await fetch(apiUrl, {
      signal: AbortSignal.timeout(30_000),
      headers: { 'User-Agent': UA },
      cache: 'no-store',
    })

    if (!upstream.ok) return NextResponse.json({ error: `Upstream HTTP ${upstream.status}` }, { status: 502 })

    const data = await upstream.json()
    if (!Array.isArray(data)) return NextResponse.json([])

    if (tipo === 'canais') {
      type RawCanal = { stream_id: number; name: string; category_name?: string; stream_icon?: string }
      const result = (data as RawCanal[])
        .filter(c => !busca || c.name.toLowerCase().includes(busca))
        .slice(0, LIMIT)
        .map(c => ({
          id: c.stream_id,
          nome: c.name,
          categoria: c.category_name ?? '',
          logo: c.stream_icon ?? '',
          url: `${creds.host}/live/${creds.username}/${creds.password}/${c.stream_id}/index.m3u8`,
        }))
      return NextResponse.json(result)
    }

    if (tipo === 'filmes') {
      type RawVod = {
        stream_id: number; name: string; category_name?: string
        stream_icon?: string; rating?: string; year?: string
        container_extension?: string
      }
      const result = (data as RawVod[])
        .filter(f => !busca || f.name.toLowerCase().includes(busca))
        .slice(0, LIMIT)
        .map(f => ({
          id: f.stream_id,
          nome: f.name,
          categoria: f.category_name ?? '',
          logo: f.stream_icon ?? '',
          rating: f.rating ?? '',
          ano: f.year ?? '',
          url: `${creds.host}/movie/${creds.username}/${creds.password}/${f.stream_id}.${f.container_extension ?? 'mp4'}`,
        }))
      return NextResponse.json(result)
    }

    // series — sem URL direta (precisaria buscar episódios)
    type RawSerie = {
      series_id: number; name: string; category_name?: string
      cover?: string; rating?: string; releaseDate?: string
    }
    const result = (data as RawSerie[])
      .filter(s => !busca || s.name.toLowerCase().includes(busca))
      .slice(0, LIMIT)
      .map(s => ({
        id: s.series_id,
        nome: s.name,
        categoria: s.category_name ?? '',
        logo: s.cover ?? '',
        rating: s.rating ?? '',
        ano: s.releaseDate ?? '',
      }))
    return NextResponse.json(result)

  } catch (err) {
    console.error('[conteudo] GET error:', err)
    return NextResponse.json({ error: 'Erro ao buscar conteúdo' }, { status: 500 })
  }
}
