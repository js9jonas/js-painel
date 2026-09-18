import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { auth } from '@/auth'
import { enviarBotoesWhatsapp } from '@/lib/whatsapp-envio'

export const dynamic = 'force-dynamic'

// tipo/source reconhecidos por buscarOrigemTemplate() em auto-resposta-suporte.ts —
// ao clicar em "Planos estendidos", o webhook usa o id_assinatura salvo aqui pra
// responder com as opções de período certas, sem precisar adivinhar qual assinatura.
const SOURCE = 'chat-planos'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { telefone, texto, id_assinatura } = await req.json()

    if (!telefone || !texto || !id_assinatura) {
      return NextResponse.json({ error: 'telefone, texto e id_assinatura obrigatórios' }, { status: 400 })
    }

    const msgId = await enviarBotoesWhatsapp(telefone, texto, [
      { id: 'chave_pix', title: 'Chave PIX' },
      { id: 'planos_estendidos', title: 'Planos estendidos' },
    ])

    if (!msgId) {
      return NextResponse.json({ error: 'Erro ao enviar mensagem' }, { status: 500 })
    }

    await pool.query(
      `INSERT INTO public.whatsapp_mensagens
        (wa_msg_id, telefone, tipo, conteudo, origem, source, recebida_em)
       VALUES ($1, $2, 'interactive', $3, 'jonas', $4, NOW())
       ON CONFLICT (wa_msg_id) DO NOTHING`,
      [msgId, telefone, JSON.stringify({ body: { text: texto }, id_assinatura }), SOURCE]
    )

    return NextResponse.json({ success: true, message_id: msgId })
  } catch (err) {
    console.error('[Chat] Erro ao enviar planos com botão:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
