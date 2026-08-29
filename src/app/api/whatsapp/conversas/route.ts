// src/app/api/whatsapp/conversas/route.ts
import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  try {
    // Lê da tabela-resumo (mantida incremental por trigger em cada escrita
    // em whatsapp_mensagens/whatsapp_leituras — ver docs/memoria) em vez de
    // recalcular tudo a cada chamada. Essa rota é chamada por polling a cada
    // 10s pelo /chat; recalcular do zero toda vez foi o que travou o app
    // inteiro sob uso concorrente (incidente 29/08/2026).
    const result = await pool.query(`
      SELECT telefone, nome_contato, id_cliente, nome_cliente, foto_url,
             ultima_mensagem_em, ultima_mensagem, ultimo_tipo, nao_lidas
      FROM public.chat_conversas_resumo
      ORDER BY ultima_mensagem_em DESC
    `)

    return NextResponse.json(result.rows)
  } catch (err) {
    console.error('[Chat] Erro ao buscar conversas:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}