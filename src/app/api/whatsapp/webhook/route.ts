import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { pool } from '@/lib/db'
import { maybeSyncLabels } from '@/lib/label-sync'
import { responderFalarComSuporte } from '@/lib/auto-resposta-suporte'

export const dynamic = 'force-dynamic'

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN!
const APP_SECRET   = process.env.WHATSAPP_APP_SECRET!

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
    const rawBody = await req.text()

    // Verifica assinatura HMAC-SHA256 enviada pela Meta
    if (!APP_SECRET) {
      console.warn('[WhatsApp] WHATSAPP_APP_SECRET não definida — verificação HMAC desativada')
    } else {
      const sig = req.headers.get('x-hub-signature-256') ?? ''
      const expected = 'sha256=' + createHmac('sha256', APP_SECRET).update(rawBody).digest('hex')
      const sigBuf  = Buffer.from(sig)
      const expBuf  = Buffer.from(expected)
      if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
        console.warn('[WhatsApp] Assinatura inválida no webhook')
        return new NextResponse('Forbidden', { status: 403 })
      }
    }

    const body = JSON.parse(rawBody)

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

            // Reação de cliente a uma mensagem
            if (msg.type === 'reaction') {
              const { message_id, emoji } = msg.reaction ?? {}
              if (message_id) {
                await pool.query(
                  `UPDATE public.whatsapp_mensagens SET reacao = $1 WHERE wa_msg_id = $2`,
                  [emoji || null, message_id]
                )
              }
              continue
            }

            let tipo        = msg.type
            let conteudo    = ''
            let media_mime  = null as string | null
            let nome_arquivo = null as string | null
            if (msg.type === 'text')     conteudo = msg.text?.body ?? ''
            else if (msg.type === 'audio') {
              conteudo = msg.audio?.id ?? ''
              media_mime = msg.audio?.mime_type ?? null
            } else if (msg.type === 'image') {
              conteudo = msg.image?.id ?? ''
              media_mime = msg.image?.mime_type ?? null
            } else if (msg.type === 'document') {
              conteudo = msg.document?.id ?? ''
              media_mime = msg.document?.mime_type ?? null
              nome_arquivo = msg.document?.filename ?? null
            } else if (msg.type === 'video') {
              conteudo = msg.video?.id ?? ''
              media_mime = msg.video?.mime_type ?? null
            } else if (msg.type === 'sticker') {
              conteudo = msg.sticker?.id ?? ''
              media_mime = msg.sticker?.mime_type ?? 'image/webp'
            } else if (msg.type === 'interactive') {
              const iv = msg.interactive ?? {}
              const reply = iv.button_reply ?? iv.list_reply ?? {}
              conteudo = reply.title ?? JSON.stringify(iv).slice(0, 300)
              tipo = 'interactive_reply'
            } else if (msg.type === 'button') {
              // Clique em botão quick-reply anexado a um TEMPLATE — formato diferente do 'interactive'
              conteudo = msg.button?.text ?? JSON.stringify(msg.button ?? {}).slice(0, 300)
              tipo = 'interactive_reply'
            } else {
              console.log(`[WhatsApp] Tipo desconhecido de cliente: ${msg.type}`, JSON.stringify(msg).slice(0, 1000))
              conteudo = JSON.stringify(msg[msg.type] ?? {})
            }

            // Captura reply context (cliente respondeu alguma mensagem)
            const replyToId = msg.context?.id ?? null
            let replyToConteudo: string | null = null
            let replyToOrigem: string | null = null
            if (replyToId) {
              const orig = await pool.query(
                `SELECT conteudo, tipo, origem FROM public.whatsapp_mensagens WHERE wa_msg_id = $1 LIMIT 1`,
                [replyToId]
              )
              if (orig.rows[0]) {
                const r = orig.rows[0]
                replyToConteudo = r.tipo === 'text' ? (r.conteudo ?? null) : `[${r.tipo}]`
                replyToOrigem = r.origem
              }
            }

            console.log(`[WhatsApp] Recebido de ${from}: ${tipo}`)

            await pool.query(
              `INSERT INTO public.whatsapp_mensagens
                (wa_msg_id, telefone, nome_contato, tipo, conteudo, media_mime, nome_arquivo, origem,
                 reply_to_wa_msg_id, reply_to_conteudo, reply_to_origem, recebida_em, phone_number_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'cliente', $8, $9, $10, $11, $12)
               ON CONFLICT (wa_msg_id) DO NOTHING`,
              [msgId, from, nome, tipo, conteudo, media_mime, nome_arquivo,
               replyToId, replyToConteudo, replyToOrigem, timestamp, metadata?.phone_number_id]
            )

            // Auto-resposta a cliques nos botões do fluxo de vencimento — fire-and-forget
            if (tipo === 'interactive_reply' && ['Falar com suporte', 'Chave PIX', 'Automático mensal'].includes(conteudo)) {
              responderFalarComSuporte({
                telefone: from,
                cliqueMsgId: msgId,
                botaoClicado: conteudo,
                replyToMsgId: replyToId,
              }).catch(err => console.error('[WhatsApp] auto-resposta-suporte error:', err))
            }

            // Sync de etiquetas WA — fire-and-forget, no máximo 1x/dia por contato
            maybeSyncLabels(from).catch(err =>
              console.error('[WhatsApp] label-sync error:', err)
            )
          }

          // Status updates (sent, delivered, read, failed)
          for (const status of value.statuses ?? []) {
            await pool.query(
              `UPDATE public.whatsapp_mensagens SET status = $1, status_at = NOW(), status_error = $2 WHERE wa_msg_id = $3`,
              [status.status, status.errors ? JSON.stringify(status.errors) : null, status.id]
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
            if (msg.type === 'text')          conteudo = msg.text?.body ?? ''
            else if (msg.type === 'audio')    conteudo = msg.audio?.id ?? ''
            else if (msg.type === 'image')    conteudo = msg.image?.id ?? ''
            else if (msg.type === 'document') conteudo = msg.document?.id ?? ''
            else if (msg.type === 'video')    conteudo = msg.video?.id ?? ''
            else if (msg.type === 'sticker')  conteudo = msg.sticker?.id ?? ''
            else if (msg.type === 'template') {
              const comps = msg.template?.components ?? []
              const copyBtn = comps.find((c: any) => c.sub_type === 'copy_code')
              conteudo = JSON.stringify({
                name: msg.template?.name ?? null,
                copyCode: copyBtn?.parameters?.[0]?.coupon_code ?? null,
              })
            } else if (msg.type === 'interactive') {
              conteudo = JSON.stringify(msg.interactive ?? {})
            } else if (msg.type === 'reaction') {
              // Reação enviada pelo Jonas via celular — atualiza a mensagem alvo
              const { message_id, emoji } = msg.reaction ?? {}
              if (message_id) {
                await pool.query(
                  `UPDATE public.whatsapp_mensagens SET reacao = $1 WHERE wa_msg_id = $2`,
                  [emoji || null, message_id]
                )
              }
              continue
            } else if (msg.type === 'unsupported') {
              // PIX nativo do WhatsApp Pay — Meta não expõe conteúdo no echo
              tipo = 'pix'
              conteudo = ''
            } else {
              console.log(`[WhatsApp] Echo tipo desconhecido: ${msg.type}`, JSON.stringify(msg).slice(0, 500))
              conteudo = JSON.stringify(msg[msg.type] ?? {})
            }

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