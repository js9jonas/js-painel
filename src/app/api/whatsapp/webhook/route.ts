import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN!

// GET — verificação do webhook pela Meta
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const mode      = searchParams.get('hub.mode')
  const token     = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[WhatsApp] Webhook verificado com sucesso')
    return new NextResponse(challenge, { status: 200 })
  }

  return new NextResponse('Forbidden', { status: 403 })
}

// POST — recebe mensagens e eventos da Meta
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Ignora eventos que não são do WhatsApp Business
    if (body.object !== 'whatsapp_business_account') {
      return NextResponse.json({ status: 'ignored' })
    }

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        if (change.field !== 'messages') continue

        const value    = change.value
        const messages = value.messages ?? []
        const contacts = value.contacts ?? []
        const metadata = value.metadata  // phone_number_id, display_phone_number

        for (const msg of messages) {
          const from    = msg.from        // número do cliente (pode ser LID ou telefone)
          const msgId   = msg.id
          const timestamp = new Date(parseInt(msg.timestamp) * 1000)

          // Nome do contato se disponível
          const contact = contacts.find((c: any) => c.wa_id === from)
          const nome    = contact?.profile?.name ?? null

          // Tipo e conteúdo da mensagem
          let tipo     = msg.type
          let conteudo = ''

          if (msg.type === 'text') {
            conteudo = msg.text?.body ?? ''
          } else if (msg.type === 'audio') {
            conteudo = msg.audio?.id ?? '' // ID da mídia para download posterior
          } else if (msg.type === 'image') {
            conteudo = msg.image?.id ?? ''
          } else if (msg.type === 'document') {
            conteudo = msg.document?.id ?? ''
          } else if (msg.type === 'video') {
            conteudo = msg.video?.id ?? ''
          }

          console.log(`[WhatsApp] Mensagem recebida de ${from}: ${tipo} — ${conteudo}`)

          // Salva no banco
          await pool.query(
            `INSERT INTO public.whatsapp_mensagens
              (wa_msg_id, telefone, nome_contato, tipo, conteudo, origem, recebida_em, phone_number_id)
             VALUES ($1, $2, $3, $4, $5, 'cliente', $6, $7)
             ON CONFLICT (wa_msg_id) DO NOTHING`,
            [msgId, from, nome, tipo, conteudo, timestamp, metadata.phone_number_id]
          )
        }

        // Confirmações de leitura (status updates)
        for (const status of value.statuses ?? []) {
          // sent, delivered, read, failed
          await pool.query(
            `UPDATE public.whatsapp_mensagens
             SET status = $1, status_at = NOW()
             WHERE wa_msg_id = $2`,
            [status.status, status.id]
          )
        }
      }
    }

    return NextResponse.json({ status: 'ok' })
  } catch (err) {
    console.error('[WhatsApp] Erro no webhook:', err)
    return NextResponse.json({ status: 'error' }, { status: 500 })
  }
}