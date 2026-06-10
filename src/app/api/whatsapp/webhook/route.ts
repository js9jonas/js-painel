import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { maybeSyncLabels } from '@/lib/label-sync'

export const dynamic = 'force-dynamic'

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
        const value    = change.value
        const metadata = value.metadata  // phone_number_id, display_phone_number

        if (change.field === 'messages') {
          const messages = value.messages ?? []
          const contacts = value.contacts ?? []

          for (const msg of messages) {
            const from      = msg.from   // número do cliente
            const msgId     = msg.id
            const timestamp = new Date(parseInt(msg.timestamp) * 1000)

            const contact = contacts.find((c: any) => c.wa_id === from)
            const nome    = contact?.profile?.name ?? null

            let tipo     = msg.type
            let conteudo = ''
            if (msg.type === 'text')     conteudo = msg.text?.body ?? ''
            else if (msg.type === 'audio')    conteudo = msg.audio?.id ?? ''
            else if (msg.type === 'image')    conteudo = msg.image?.id ?? ''
            else if (msg.type === 'document') conteudo = msg.document?.id ?? ''
            else if (msg.type === 'video')    conteudo = msg.video?.id ?? ''

            console.log(`[WhatsApp] Recebido de ${from}: ${tipo}`)

            await pool.query(
              `INSERT INTO public.whatsapp_mensagens
                (wa_msg_id, telefone, nome_contato, tipo, conteudo, origem, recebida_em, phone_number_id)
               VALUES ($1, $2, $3, $4, $5, 'cliente', $6, $7)
               ON CONFLICT (wa_msg_id) DO NOTHING`,
              [msgId, from, nome, tipo, conteudo, timestamp, metadata?.phone_number_id]
            )

            // Sync de etiquetas WA — fire-and-forget, no máximo 1x/dia por contato
            maybeSyncLabels(from).catch(err =>
              console.error('[WhatsApp] label-sync error:', err)
            )
          }

          // Status updates (sent, delivered, read, failed)
          for (const status of value.statuses ?? []) {
            await pool.query(
              `UPDATE public.whatsapp_mensagens SET status = $1, status_at = NOW() WHERE wa_msg_id = $2`,
              [status.status, status.id]
            )
          }

        } else if (change.field === 'smb_message_echoes') {
          // Mensagens enviadas pelo Jonas via celular ou WhatsApp Web
          // Payload usa "message_echoes" (não "messages")
          const messages = value.message_echoes ?? []

          for (const msg of messages) {
            const to        = msg.to     // número do cliente destinatário
            const msgId     = msg.id
            const timestamp = new Date(parseInt(msg.timestamp) * 1000)

            let tipo     = msg.type
            let conteudo = ''
            if (msg.type === 'text')     conteudo = msg.text?.body ?? ''
            else if (msg.type === 'audio')    conteudo = msg.audio?.id ?? ''
            else if (msg.type === 'image')    conteudo = msg.image?.id ?? ''
            else if (msg.type === 'document') conteudo = msg.document?.id ?? ''
            else if (msg.type === 'video')    conteudo = msg.video?.id ?? ''

            console.log(`[WhatsApp] Echo (phone) para ${to}: ${tipo}`)

            await pool.query(
              `INSERT INTO public.whatsapp_mensagens
                (wa_msg_id, telefone, tipo, conteudo, origem, source, recebida_em, phone_number_id)
               VALUES ($1, $2, $3, $4, 'jonas', 'phone', $5, $6)
               ON CONFLICT (wa_msg_id) DO NOTHING`,
              [msgId, to, tipo, conteudo, timestamp, metadata?.phone_number_id]
            )
          }
        }
      }
    }

    // Encaminha evento para n8n (fire-and-forget)
    fetch('https://js-n8n.l1fcxz.easypanel.host/webhook/whatsapp-cloud', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(err => console.error('[WhatsApp] Erro ao encaminhar para n8n:', err))

    return NextResponse.json({ status: 'ok' })
  } catch (err) {
    console.error('[WhatsApp] Erro no webhook:', err)
    return NextResponse.json({ status: 'error' }, { status: 500 })
  }
}