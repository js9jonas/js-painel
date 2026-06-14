import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

const TOKEN = process.env.WHATSAPP_TOKEN!
const STICKERS_DIR = path.join(process.cwd(), 'public', 'stickers')

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { media_id, pack } = await req.json()
  if (!media_id) return NextResponse.json({ error: 'media_id obrigatório' }, { status: 400 })

  const packName = (pack ?? 'recebidos').replace(/[^a-z0-9\-_]/gi, '_')

  try {
    // Resolve URL via Meta
    const metaRes = await fetch(`https://graph.facebook.com/v22.0/${media_id}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    })
    if (!metaRes.ok) return NextResponse.json({ error: 'Mídia não encontrada' }, { status: 404 })
    const { url } = await metaRes.json()
    if (!url) return NextResponse.json({ error: 'URL não disponível' }, { status: 404 })

    // Baixa o arquivo
    const mediaRes = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } })
    if (!mediaRes.ok) return NextResponse.json({ error: 'Falha ao baixar' }, { status: 502 })
    const buffer = Buffer.from(await mediaRes.arrayBuffer())

    // Garante pasta do pack
    const packDir = path.join(STICKERS_DIR, packName)
    fs.mkdirSync(packDir, { recursive: true })

    // Cria pack.json se não existir
    const jsonPath = path.join(packDir, 'pack.json')
    if (!fs.existsSync(jsonPath)) {
      fs.writeFileSync(jsonPath, JSON.stringify({ nome: packName === 'recebidos' ? 'Recebidos' : packName, emoji: '📥' }))
    }

    // Salva o WebP
    const filename = `sticker_${Date.now()}.webp`
    fs.writeFileSync(path.join(packDir, filename), buffer)

    const stickerUrl = `/stickers/${packName}/${filename}`
    return NextResponse.json({ success: true, url: stickerUrl })
  } catch (err) {
    console.error('[Stickers/salvar]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
