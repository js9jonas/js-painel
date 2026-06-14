import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { auth } from '@/auth'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

const STICKERS_DIR = path.join(process.cwd(), 'public', 'stickers')
const BASE_URL = '/stickers'

function lerPacks() {
  if (!fs.existsSync(STICKERS_DIR)) return []
  return fs.readdirSync(STICKERS_DIR, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(dir => {
      const packDir = path.join(STICKERS_DIR, dir.name)
      let nome = dir.name
      let emoji = '📦'
      const jsonPath = path.join(packDir, 'pack.json')
      if (fs.existsSync(jsonPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
          if (meta.nome) nome = meta.nome
          if (meta.emoji) emoji = meta.emoji
        } catch {}
      }
      const stickers = fs.readdirSync(packDir)
        .filter(f => /\.(webp|gif|png)$/i.test(f))
        .sort()
        .map(f => `${BASE_URL}/${dir.name}/${f}`)
      return { id: dir.name, nome, emoji, stickers }
    })
    .filter(p => p.stickers.length > 0)
}

// GET — packs + favoritos
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  if (searchParams.get('tipo') === 'favoritos') {
    const r = await pool.query(
      'SELECT url FROM public.whatsapp_sticker_favoritos ORDER BY criado_em DESC'
    )
    return NextResponse.json({ favoritos: r.rows.map(r => r.url) })
  }

  return NextResponse.json({ packs: lerPacks() })
}

// POST — toggle favorito
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { url } = await req.json()
  if (!url) return NextResponse.json({ error: 'url obrigatória' }, { status: 400 })

  const existe = await pool.query(
    'SELECT id FROM public.whatsapp_sticker_favoritos WHERE url = $1', [url]
  )
  if (existe.rows.length > 0) {
    await pool.query('DELETE FROM public.whatsapp_sticker_favoritos WHERE url = $1', [url])
    return NextResponse.json({ acao: 'removido' })
  } else {
    await pool.query(
      'INSERT INTO public.whatsapp_sticker_favoritos (url) VALUES ($1)', [url]
    )
    return NextResponse.json({ acao: 'adicionado' })
  }
}
