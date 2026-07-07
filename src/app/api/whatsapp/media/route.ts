import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { pool } from '@/lib/db'
import { createDriveAuth } from '@/lib/google-drive'

export const dynamic = 'force-dynamic'

const TOKEN = process.env.WHATSAPP_TOKEN!

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })

  // ── 1. Já arquivada no Drive? Serve direto — mídia arquivada já expirou na Meta,
  //      então tentar a Meta primeiro seria uma chamada fadada a falhar (InvalidID).
  const dbRes = await pool.query(
    `SELECT media_drive_id, media_mime
     FROM public.whatsapp_mensagens
     WHERE conteudo = $1 AND media_drive_id IS NOT NULL
     LIMIT 1`,
    [id]
  )
  const row = dbRes.rows[0]

  if (row?.media_drive_id) {
    const driveAuth = createDriveAuth()
    if (driveAuth) {
      const { token } = await driveAuth.getAccessToken()
      if (token) {
        const driveRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${row.media_drive_id}?alt=media`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        if (driveRes.ok) {
          return new NextResponse(driveRes.body, {
            headers: {
              'Content-Type': row.media_mime ?? driveRes.headers.get('content-type') ?? 'application/octet-stream',
              'Cache-Control': 'private, max-age=2592000',
            },
          })
        }
      }
    }
    // Drive indisponível apesar de arquivada — cai pro fallback da Meta abaixo.
  }

  // ── 2. Ainda não arquivada (ou Drive falhou agora): tenta Meta Cloud API ──
  const metaRes = await fetch(`https://graph.facebook.com/v22.0/${id}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })

  if (metaRes.ok) {
    const { url, mime_type } = await metaRes.json()

    if (url) {
      const fetchHeaders: Record<string, string> = { Authorization: `Bearer ${TOKEN}` }
      const range = req.headers.get('range')
      if (range) fetchHeaders['Range'] = range

      const mediaRes = await fetch(url, { headers: fetchHeaders })
      if (mediaRes.ok || mediaRes.status === 206) {
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
    }
  }

  return NextResponse.json({ error: 'Mídia não encontrada' }, { status: 404 })
}
