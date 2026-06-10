import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const TOKEN = process.env.WHATSAPP_TOKEN!

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  // Resolve URL real do arquivo via Meta API
  const metaRes = await fetch(`https://graph.facebook.com/v22.0/${id}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  if (!metaRes.ok) return NextResponse.json({ error: 'Mídia não encontrada' }, { status: 404 })

  const { url, mime_type } = await metaRes.json()
  if (!url) return NextResponse.json({ error: 'URL não disponível' }, { status: 404 })

  // Encaminha Range se o browser pedir (necessário para seek em audio/video)
  const fetchHeaders: Record<string, string> = { Authorization: `Bearer ${TOKEN}` }
  const range = req.headers.get('range')
  if (range) fetchHeaders['Range'] = range

  const mediaRes = await fetch(url, { headers: fetchHeaders })
  if (!mediaRes.ok && mediaRes.status !== 206) {
    return NextResponse.json({ error: 'Falha ao baixar mídia' }, { status: 502 })
  }

  const resHeaders: Record<string, string> = {
    'Content-Type': mime_type ?? mediaRes.headers.get('content-type') ?? 'application/octet-stream',
    'Cache-Control': 'private, max-age=300',
  }

  for (const h of ['content-length', 'content-range', 'accept-ranges']) {
    const v = mediaRes.headers.get(h)
    if (v) resHeaders[h] = v
  }

  return new NextResponse(mediaRes.body, { status: mediaRes.status, headers: resHeaders })
}
