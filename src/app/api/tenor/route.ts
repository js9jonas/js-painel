import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

const GIPHY_KEY = process.env.GIPHY_API_KEY ?? ''
const GIPHY_BASE = 'https://api.giphy.com/v1/gifs'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''
  const offset = parseInt(searchParams.get('pos') ?? '0', 10)
  const limit = 20

  const params = new URLSearchParams({
    api_key: GIPHY_KEY,
    limit: String(limit),
    offset: String(offset),
    rating: 'pg',
    lang: 'pt',
  })

  const endpoint = q
    ? `${GIPHY_BASE}/search?${params}&q=${encodeURIComponent(q)}`
    : `${GIPHY_BASE}/trending?${params}`

  try {
    const r = await fetch(endpoint)
    const data = await r.json()
    type GiphyImage = { url?: string; mp4?: string }
    // Normaliza para { results: [{id, gif, tinygif, mp4, preview}], next }
    const results = (data.data ?? []).map((item: Record<string, unknown>) => {
      const images = (item.images ?? {}) as Record<string, GiphyImage>
      return {
        id: item.id,
        gif: images.original?.url ?? images.downsized?.url ?? '',
        tinygif: images.fixed_width_downsampled?.url ?? images.fixed_width_small?.url ?? '',
        mp4: images.original?.mp4 ?? images.fixed_height?.mp4 ?? '',
        preview: images.fixed_width_downsampled?.url ?? '',
        title: item.title ?? '',
      }
    })
    const pagination = (data.pagination ?? {}) as { offset?: number; count?: number; total_count?: number }
    const nextOffset = (pagination.offset ?? offset) + (pagination.count ?? results.length)
    const hasMore = nextOffset < (pagination.total_count ?? 0)
    return NextResponse.json({ results, next: hasMore ? String(nextOffset) : '' })
  } catch (err) {
    console.error('[Giphy]', err)
    return NextResponse.json({ error: 'Erro ao buscar GIFs' }, { status: 500 })
  }
}
