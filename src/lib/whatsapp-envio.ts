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

interface RegistrarMensagemOpts {
  source: string
  replyToMsgId?: string
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
     VALUES ($1, $2, 'text', $3, 'jonas', $4, $5, NOW())
     ON CONFLICT (wa_msg_id) DO NOTHING`,
    [waMsgId, telefone, conteudo, opts.source, opts.replyToMsgId ?? null]
  )
}
