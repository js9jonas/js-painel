import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'

export const dynamic = 'force-dynamic'

const INTERNAL_KEY = process.env.WHATSAPP_INTERNAL_KEY

export async function POST(req: NextRequest) {
  const apiKey = req.headers.get('x-api-key')
  if (!INTERNAL_KEY || apiKey !== INTERNAL_KEY) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { wa_msg_id, telefone, tipo, conteudo, source } = body

    if (!wa_msg_id || !telefone || !tipo) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: wa_msg_id, telefone, tipo' },
        { status: 400 }
      )
    }

    const result = await pool.query(
      `INSERT INTO public.whatsapp_mensagens
        (wa_msg_id, telefone, tipo, conteudo, origem, source, recebida_em)
       VALUES ($1, $2, $3, $4, 'jonas', $5, NOW())
       ON CONFLICT (wa_msg_id) DO NOTHING
       RETURNING id`,
      [wa_msg_id, telefone, tipo, conteudo ?? '', source ?? 'n8n']
    )

    const inserted = result.rowCount! > 0
    console.log(`[WhatsApp] Registrar: ${inserted ? 'inserido' : 'duplicado'} ${wa_msg_id} → ${telefone}`)

    return NextResponse.json({ success: true, inserted })
  } catch (err) {
    console.error('[WhatsApp] Erro ao registrar mensagem:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
