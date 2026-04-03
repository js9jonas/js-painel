// src/app/api/whatsapp/enviar/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { telefone, mensagem, sugestao_ia, foi_aceita } = await req.json()

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
        (wa_msg_id, telefone, tipo, conteudo, origem, sugestao_ia, foi_aceita, mensagem_final, recebida_em)
      VALUES ($1, $2, 'text', $3, 'jonas', $4, $5, $3, NOW())
      ON CONFLICT (wa_msg_id) DO NOTHING
    `, [
      data.messages?.[0]?.id ?? `sent_${Date.now()}`,
      telefone,
      mensagem,
      sugestao_ia ?? null,
      foi_aceita ?? null
    ])

    return NextResponse.json({ success: true, message_id: data.messages?.[0]?.id })
  } catch (err) {
    console.error('[Chat] Erro ao enviar:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}