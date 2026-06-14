import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

const TENOR_KEY = process.env.TENOR_API_KEY ?? ''
const TENOR_BASE = 'https://tenor.googleapis.com/v2'
const CLIENT_KEY = 'js-painel'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q') ?? ''
  const pos = searchParams.get('pos') ?? ''
  const limit = 20

  const params = new URLSearchParams({
    key: TENOR_KEY,
    client_key: CLIENT_KEY,
    limit: String(limit),
    media_filter: 'gif,tinygif,mp4,tinymp4',
    contentfilter: 'low',
  })
  if (pos) params.set('pos', pos)

  const endpoint = q
    ? `${TENOR_BASE}/search?${params}&q=${encodeURIComponent(q)}`
    : `${TENOR_BASE}/featured?${params}`

  try {
    const r = await fetch(endpoint)
    const data = await r.json()
    // Normaliza para { results: [{id, gif, tinygif, mp4, preview}], next }
    const results = (data.results ?? []).map((item: Record<string, unknown>) => {
      const media = (item.media_formats ?? {}) as Record<string, { url: string; dims: number[] }>
      return {
        id: item.id,
        gif: media.gif?.url ?? '',
        tinygif: media.tinygif?.url ?? media.gif?.url ?? '',
        mp4: media.mp4?.url ?? media.tinymp4?.url ?? '',
        preview: media.tinygif?.url ?? media.gif?.url ?? '',
        title: item.title ?? '',
      }
    })
    return NextResponse.json({ results, next: data.next ?? '' })
  } catch (err) {
    console.error('[Tenor]', err)
    return NextResponse.json({ error: 'Erro ao buscar GIFs' }, { status: 500 })
  }
}
