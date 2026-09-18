import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { auth } from '@/auth'
import { enviarBotoesWhatsapp } from '@/lib/whatsapp-envio'

export const dynamic = 'force-dynamic'

const TEXTO = 'Caso prefira não usar o PIX, você pode escolher uma das formas de pagamento abaixo:'

// Respostas incondicionais (Sicredi/Lotérica/Banrisul) — não dependem de reconhecer a
// origem da mensagem, ao contrário do fluxo de "Planos estendidos". Ver auto-resposta-suporte.ts.
export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { telefone } = await req.json()
    if (!telefone) {
      return NextResponse.json({ error: 'telefone obrigatório' }, { status: 400 })
    }

    const msgId = await enviarBotoesWhatsapp(telefone, TEXTO, [
      { id: 'sicredi', title: 'Sicredi' },
      { id: 'loterica', title: 'Lotérica' },
      { id: 'banrisul', title: 'Banrisul' },
    ])

    if (!msgId) {
      return NextResponse.json({ error: 'Erro ao enviar mensagem' }, { status: 500 })
    }

    await pool.query(
      `INSERT INTO public.whatsapp_mensagens
        (wa_msg_id, telefone, tipo, conteudo, origem, source, recebida_em)
       VALUES ($1, $2, 'interactive', $3, 'jonas', 'chat-pagamento', NOW())
       ON CONFLICT (wa_msg_id) DO NOTHING`,
      [msgId, telefone, JSON.stringify({ body: { text: TEXTO } })]
    )

    return NextResponse.json({ success: true, message_id: msgId })
  } catch (err) {
    console.error('[Chat] Erro ao enviar formas de pagamento:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
