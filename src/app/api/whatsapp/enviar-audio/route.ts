import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { auth } from '@/auth'
import { tmpdir } from 'os'
import { join } from 'path'
import { writeFile, readFile, unlink } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
const ffmpegPath = join(process.cwd(), 'node_modules', 'ffmpeg-static', 'ffmpeg')

const execFileAsync = promisify(execFile)

export const dynamic = 'force-dynamic'

const TOKEN = process.env.WHATSAPP_TOKEN!
const PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!

// Converte webm/opus para ogg/opus via ffmpeg (mesma codificação, container diferente)
async function converterParaOgg(inputBuffer: Buffer, inputMime: string): Promise<Buffer> {
  const base = inputMime.split(';')[0].trim().toLowerCase()

  // Se já for um formato aceito pela Meta, retornar como está
  const aceitos = ['audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/amr']
  if (aceitos.includes(base)) return inputBuffer

  const id = Date.now() + '_' + Math.random().toString(36).slice(2)
  const entrada = join(tmpdir(), `audio_in_${id}.webm`)
  const saida = join(tmpdir(), `audio_out_${id}.ogg`)

  try {
    await writeFile(entrada, inputBuffer)

    await execFileAsync(ffmpegPath, [
      '-y',
      '-i', entrada,
      '-c:a', 'libopus',
      '-b:a', '64k',
      saida,
    ], { timeout: 30000 })

    return await readFile(saida)
  } finally {
    await unlink(entrada).catch(() => {})
    await unlink(saida).catch(() => {})
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const formData = await req.formData()
  const audio = formData.get('audio') as File | null
  const telefone = formData.get('telefone') as string | null

  if (!audio || !telefone) {
    return NextResponse.json({ error: 'audio e telefone obrigatórios' }, { status: 400 })
  }

  try {
    const inputBuffer = Buffer.from(await audio.arrayBuffer())

    // Converter webm → ogg (Opus) para compatibilidade com a Meta API
    let audioBuffer: Buffer
    let tipo: string
    try {
      audioBuffer = await converterParaOgg(inputBuffer, audio.type)
      tipo = 'audio/ogg'
    } catch (convErr) {
      console.error('[enviar-audio] Falha na conversão, enviando original:', convErr)
      audioBuffer = inputBuffer
      tipo = audio.type.split(';')[0].trim() || 'audio/webm'
    }

    // 1. Upload para a Meta Media API
    const uploadForm = new FormData()
    const audioBlob = new Blob([new Uint8Array(audioBuffer)], { type: tipo })
    uploadForm.append('file', audioBlob, 'audio.ogg')
    uploadForm.append('type', tipo)
    uploadForm.append('messaging_product', 'whatsapp')

    const uploadRes = await fetch(`https://graph.facebook.com/v22.0/${PHONE_ID}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}` },
      body: uploadForm,
    })

    if (!uploadRes.ok) {
      const err = await uploadRes.text()
      console.error('[enviar-audio] Erro no upload:', err)
      return NextResponse.json({ error: 'Falha no upload de mídia', detalhe: err }, { status: 502 })
    }

    const { id: mediaId } = await uploadRes.json()

    // 2. Enviar mensagem de áudio
    const msgRes = await fetch(`https://graph.facebook.com/v22.0/${PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: telefone,
        type: 'audio',
        audio: { id: mediaId },
      }),
    })

    if (!msgRes.ok) {
      const err = await msgRes.text()
      console.error('[enviar-audio] Erro ao enviar:', err)
      return NextResponse.json({ error: 'Falha ao enviar áudio', detalhe: err }, { status: 502 })
    }

    const msgData = await msgRes.json()
    const waId = msgData.messages?.[0]?.id ?? `sent_audio_${Date.now()}`

    // 3. Salvar no banco — conteudo = media_id string (igual ao webhook)
    await pool.query(`
      INSERT INTO public.whatsapp_mensagens
        (wa_msg_id, telefone, tipo, conteudo, origem, source, recebida_em)
      VALUES ($1, $2, 'audio', $3, $4, $5, NOW())
      ON CONFLICT (wa_msg_id) DO NOTHING
    `, [
      waId,
      telefone,
      mediaId,
      'jonas',
      session?.user?.email ? `chat:${session.user.email}` : 'chat',
    ])

    return NextResponse.json({ ok: true, wa_id: waId })
  } catch (err) {
    console.error('[enviar-audio] Erro interno:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
