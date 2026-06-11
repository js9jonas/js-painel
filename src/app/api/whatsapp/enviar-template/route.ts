import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { telefone, template_name } = await req.json()

    if (!telefone || !template_name) {
      return NextResponse.json({ error: 'telefone e template_name obrigatórios' }, { status: 400 })
    }

    const token = process.env.WHATSAPP_TOKEN
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID

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
          type: 'template',
          template: {
            name: template_name,
            language: { code: 'pt_BR' },
          },
        }),
      }
    )

    const data = await response.json()

    if (!response.ok) {
      console.error('[Chat] Erro ao enviar template:', data)
      return NextResponse.json({ error: data.error?.message ?? 'Erro ao enviar template' }, { status: 500 })
    }

    await pool.query(
      `INSERT INTO public.whatsapp_mensagens
        (wa_msg_id, telefone, tipo, conteudo, origem, source, recebida_em)
       VALUES ($1, $2, 'template', $3, 'jonas', $4, NOW())
       ON CONFLICT (wa_msg_id) DO NOTHING`,
      [
        data.messages?.[0]?.id ?? `tmpl_${Date.now()}`,
        telefone,
        JSON.stringify({ name: template_name, copyCode: null }),
        session?.user?.email ? `chat:${session.user.email}` : 'chat',
      ]
    )

    return NextResponse.json({ success: true, message_id: data.messages?.[0]?.id })
  } catch (err) {
    console.error('[Chat] Erro ao enviar template:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
