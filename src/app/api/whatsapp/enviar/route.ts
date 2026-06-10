// src/app/api/whatsapp/enviar/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    const { telefone, mensagem, sugestao_ia, foi_aceita, reply_msg_id } = await req.json()

    if (!telefone || !mensagem) {
      return NextResponse.json({ error: 'telefone e mensagem obrigatórios' }, { status: 400 })
    }

    const token = process.env.WHATSAPP_TOKEN
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

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
          type: 'text',
          text: { body: mensagem }
        })
      }
    )

    const data = await response.json()

    if (!response.ok) {
      console.error('[Chat] Erro ao enviar mensagem:', data)
      return NextResponse.json({ error: data.error?.message ?? 'Erro ao enviar' }, { status: 500 })
    }

    // Salva no banco
    await pool.query(`
      INSERT INTO public.whatsapp_mensagens
        (wa_msg_id, telefone, tipo, conteudo, origem, sugestao_ia, foi_aceita, mensagem_final, source, recebida_em)
      VALUES ($1, $2, 'text', $3, 'jonas', $4, $5, $3, $6, NOW())
      ON CONFLICT (wa_msg_id) DO NOTHING
    `, [
      data.messages?.[0]?.id ?? `sent_${Date.now()}`,
      telefone,
      mensagem,
      sugestao_ia ?? null,
      foi_aceita ?? null,
      session?.user?.email ? `chat:${session.user.email}` : 'chat',
    ])

    return NextResponse.json({ success: true, message_id: data.messages?.[0]?.id })
  } catch (err) {
    console.error('[Chat] Erro ao enviar:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}