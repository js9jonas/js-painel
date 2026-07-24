import { pool } from '@/lib/db'

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID

export async function enviarTextoWhatsapp(telefone: string, texto: string): Promise<string | null> {
  const response = await fetch(`https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: telefone,
      type: 'text',
      text: { body: texto },
    }),
  })

  const data = await response.json()
  if (!response.ok) {
    console.error('[WhatsappEnvio] Erro ao enviar texto:', data)
    return null
  }
  return data.messages?.[0]?.id ?? null
}

export interface EnvioImagemResultado {
  waMsgId: string
  mediaId: string
}

export async function enviarImagemWhatsapp(telefone: string, imagem: Buffer, caption?: string): Promise<EnvioImagemResultado | null> {
  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('type', 'image/png')
  form.append('file', new Blob([new Uint8Array(imagem)], { type: 'image/png' }), 'imagem.png')

  const uploadResponse = await fetch(`https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/media`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    body: form,
  })
  const uploadData = await uploadResponse.json()
  if (!uploadResponse.ok || !uploadData.id) {
    console.error('[WhatsappEnvio] Erro ao subir imagem:', uploadData)
    return null
  }

  const response = await fetch(`https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: telefone,
      type: 'image',
      image: { id: uploadData.id, ...(caption ? { caption } : {}) },
    }),
  })

  const data = await response.json()
  if (!response.ok) {
    console.error('[WhatsappEnvio] Erro ao enviar imagem:', data)
    return null
  }
  const waMsgId = data.messages?.[0]?.id
  if (!waMsgId) return null
  return { waMsgId, mediaId: uploadData.id }
}

interface RegistrarMensagemOpts {
  source: string
  replyToMsgId?: string
  tipo?: 'text' | 'image'
}

export async function registrarMensagemWhatsapp(
  waMsgId: string | null,
  telefone: string,
  conteudo: string,
  opts: RegistrarMensagemOpts
): Promise<void> {
  if (!waMsgId) return
  await pool.query(
    `INSERT INTO public.whatsapp_mensagens
      (wa_msg_id, telefone, tipo, conteudo, origem, source, reply_to_wa_msg_id, recebida_em)
     VALUES ($1, $2, $3, $4, 'jonas', $5, $6, NOW())
     ON CONFLICT (wa_msg_id) DO NOTHING`,
    [waMsgId, telefone, opts.tipo ?? 'text', conteudo, opts.source, opts.replyToMsgId ?? null]
  )
}
