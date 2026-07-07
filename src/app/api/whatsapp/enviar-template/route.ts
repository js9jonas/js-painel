import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { auth } from '@/auth'
import { enviarTemplateWhatsapp } from '@/lib/whatsapp-template'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

    const { telefone, template_name, parametros } = await req.json()

    if (!telefone || !template_name) {
      return NextResponse.json({ error: 'telefone e template_name obrigatórios' }, { status: 400 })
    }

    const resultado = await enviarTemplateWhatsapp(telefone, template_name, Array.isArray(parametros) ? parametros : [])

    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    await pool.query(
      `INSERT INTO public.whatsapp_mensagens
        (wa_msg_id, telefone, tipo, conteudo, origem, source, recebida_em)
       VALUES ($1, $2, 'template', $3, 'jonas', $4, NOW())
       ON CONFLICT (wa_msg_id) DO NOTHING`,
      [
        resultado.msgId,
        telefone,
        JSON.stringify({ name: template_name, parametros: parametros ?? null, copyCode: null }),
        session?.user?.email ? `chat:${session.user.email}` : 'chat',
      ]
    )

    return NextResponse.json({ success: true, message_id: resultado.msgId })
  } catch (err) {
    console.error('[Chat] Erro ao enviar template:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
