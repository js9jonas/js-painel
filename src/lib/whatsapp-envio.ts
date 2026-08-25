import { pool } from '@/lib/db'

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID

/**
 * Retry único em erro transitório da própria Meta (ex: "(#2) Service temporarily
 * unavailable", error.is_transient === true) — a API já sinaliza "tente de novo",
 * então uma segunda tentativa após um pequeno delay costuma resolver sozinha, sem
 * precisar cair em nenhum fallback. Encontrado em produção 25/08/2026: uma
 * instabilidade de alguns segundos da Meta derrubou uma notificação de renovação
 * que tinha janela de 24h ativa (não era falta de conversa, era a Meta fora do ar
 * por um instante) — ver notificar-renovacao.ts.
 */
export async function enviarTextoWhatsapp(telefone: string, texto: string): Promise<string | null> {
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
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
    if (response.ok) return data.messages?.[0]?.id ?? null

    console.error('[WhatsappEnvio] Erro ao enviar texto:', data)
    const transitorio = data?.error?.is_transient === true
    if (transitorio && tentativa === 1) {
      await new Promise((r) => setTimeout(r, 1500))
      continue
    }
    return null
  }
  return null
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
