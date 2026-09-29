import { pool } from '@/lib/db'
import { downloadFromMeta, downloadFromLocal, downloadFromDrive } from '@/lib/midia-whatsapp'

const GROQ_API_KEY = process.env.GROQ_API_KEY

export async function transcribeAudio(
  msgId: number
): Promise<{ ok: true; transcricao: string } | { ok: false; error: string }> {
  if (!GROQ_API_KEY) return { ok: false, error: 'GROQ_API_KEY não configurada' }

  // 1. Busca dados da mensagem
  const { rows } = await pool.query(
    `SELECT conteudo, media_mime, media_drive_id, media_local_path FROM public.whatsapp_mensagens WHERE id = $1`,
    [msgId]
  )
  const msg = rows[0]
  if (!msg?.conteudo) return { ok: false, error: 'Mensagem não encontrada' }

  const mediaId   = msg.conteudo as string
  const mimeType  = (msg.media_mime as string | null) ?? 'audio/ogg'
  const driveId   = msg.media_drive_id as string | null
  const localPath = msg.media_local_path as string | null

  // 2. Baixa o áudio — tenta Meta primeiro, depois disco local, depois Drive (legado)
  let buffer: Buffer
  try {
    buffer = await downloadFromMeta(mediaId)
  } catch (metaErr) {
    if (localPath) {
      try {
        buffer = await downloadFromLocal(localPath)
      } catch (localErr) {
        return { ok: false, error: `Meta: ${metaErr} | Local: ${localErr}` }
      }
    } else if (driveId) {
      try {
        buffer = await downloadFromDrive(driveId)
      } catch (driveErr) {
        return { ok: false, error: `Meta: ${metaErr} | Drive: ${driveErr}` }
      }
    } else {
      return { ok: false, error: `Download Meta falhou: ${metaErr}` }
    }
  }

  // 3. Envia para Groq Whisper
  const ext  = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('mpeg') ? 'mp3' : 'ogg'
  const form = new FormData()
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
  form.append('file', new Blob([arrayBuffer], { type: mimeType }), `audio.${ext}`)
  form.append('model', 'whisper-large-v3')
  form.append('language', 'pt')
  form.append('response_format', 'text')

  const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: form,
  })
  if (!groqRes.ok) {
    const detail = await groqRes.text()
    return { ok: false, error: `Groq ${groqRes.status}: ${detail.slice(0, 200)}` }
  }

  const transcricao = (await groqRes.text()).trim()
  if (!transcricao) return { ok: false, error: 'Transcrição vazia' }

  // 4. Salva no banco
  await pool.query(
    `UPDATE public.whatsapp_mensagens SET transcricao = $1 WHERE id = $2`,
    [transcricao, msgId]
  )

  return { ok: true, transcricao }
}
