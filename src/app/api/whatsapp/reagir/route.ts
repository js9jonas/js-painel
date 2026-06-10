import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const TOKEN         = process.env.WHATSAPP_TOKEN!
const PHONE_ID      = process.env.WHATSAPP_PHONE_NUMBER_ID!

export async function POST(req: NextRequest) {
  const { telefone, wa_msg_id, emoji } = await req.json()
  if (!telefone || !wa_msg_id || !emoji)
    return NextResponse.json({ error: 'telefone, wa_msg_id e emoji obrigatórios' }, { status: 400 })

  const res = await fetch(`https://graph.facebook.com/v22.0/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: telefone,
      type: 'reaction',
      reaction: { message_id: wa_msg_id, emoji },
    }),
  })

  const data = await res.json()
  if (!res.ok) return NextResponse.json({ error: data.error?.message }, { status: 500 })

  // Persiste reação localmente para exibição imediata
  await pool.query(
    `UPDATE public.whatsapp_mensagens SET reacao = $1 WHERE wa_msg_id = $2`,
    [emoji || null, wa_msg_id]
  )

  return NextResponse.json({ success: true })
}
