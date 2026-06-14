// src/app/api/whatsapp/enviar/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { telefone, mensagem, tipo, url, mp4_url, sugestao_ia, foi_aceita, reply_msg_id, reply_conteudo, reply_origem } = await req.json()

    const tipoEnvio = tipo ?? 'text'

    if (!telefone || (tipoEnvio === 'text' && !mensagem) || (['sticker', 'gif'].includes(tipoEnvio) && !url)) {
      return NextResponse.json({ error: 'Parâmetros insuficientes' }, { status: 400 })
    }

    const token = process.env.WHATSAPP_TOKEN
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
    const baseUrl = process.env.NEXTAUTH_URL ?? 'https://painel.jssistemas.online'

    // Monta payload por tipo
    let waPayload: Record<string, unknown>
    if (tipoEnvio === 'sticker') {
      const stickerUrl = url.startsWith('http') ? url : `${baseUrl}${url}`
      waPayload = { type: 'sticker', sticker: { link: stickerUrl } }
    } else if (tipoEnvio === 'gif') {
      const gifMp4 = mp4_url ?? url
      waPayload = { type: 'video', video: { link: gifMp4 } }
    } else {
      waPayload = { type: 'text', text: { body: mensagem } }
    }

    // Envia via WhatsApp Cloud API
    const response = await fetch(
      `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: telefone,
          ...(reply_msg_id ? { context: { message_id: reply_msg_id } } : {}),
          ...waPayload,
        })
      }
    )

    const data = await response.json()

    if (!response.ok) {
      console.error('[Chat] Erro ao enviar mensagem:', data)
      return NextResponse.json({ error: data.error?.message ?? 'Erro ao enviar' }, { status: 500 })
    }

    // Salva no banco
    const conteudoSalvo = tipoEnvio === 'text' ? mensagem : url
    await pool.query(`
      INSERT INTO public.whatsapp_mensagens
        (wa_msg_id, telefone, tipo, conteudo, origem, sugestao_ia, foi_aceita, mensagem_final, source,
         reply_to_wa_msg_id, reply_to_conteudo, reply_to_origem, recebida_em)
      VALUES ($1, $2, $3, $4, 'jonas', $5, $6, $7, $8, $9, $10, $11, NOW())
      ON CONFLICT (wa_msg_id) DO NOTHING
    `, [
      data.messages?.[0]?.id ?? `sent_${Date.now()}`,
      telefone,
      tipoEnvio,
      conteudoSalvo,
      sugestao_ia ?? null,
      foi_aceita ?? null,
      tipoEnvio === 'text' ? mensagem : null,
      session?.user?.email ? `chat:${session.user.email}` : 'chat',
      reply_msg_id ?? null,
      reply_conteudo ?? null,
      reply_origem ?? null,
    ])

    return NextResponse.json({ success: true, message_id: data.messages?.[0]?.id })
  } catch (err) {
    console.error('[Chat] Erro ao enviar:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}