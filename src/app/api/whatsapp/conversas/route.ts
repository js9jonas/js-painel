// src/app/api/whatsapp/conversas/route.ts
import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT
        wm.telefone,
        wm.nome_contato,
        c.id_cliente,
        c.nome AS nome_cliente,
        MAX(wm.recebida_em) AS ultima_mensagem_em,
        (
          SELECT conteudo FROM public.whatsapp_mensagens
          WHERE telefone = wm.telefone
          ORDER BY recebida_em DESC LIMIT 1
        ) AS ultima_mensagem,
        (
          SELECT tipo FROM public.whatsapp_mensagens
          WHERE telefone = wm.telefone
          ORDER BY recebida_em DESC LIMIT 1
        ) AS ultimo_tipo,
        COUNT(*) FILTER (WHERE wm.origem = 'cliente' AND wm.foi_aceita IS NULL) AS nao_lidas
      FROM public.whatsapp_mensagens wm
      LEFT JOIN public.clientes c ON c.id_cliente = wm.id_cliente
      GROUP BY wm.telefone, wm.nome_contato, c.id_cliente, c.nome
      ORDER BY ultima_mensagem_em DESC
    `)

    return NextResponse.json(result.rows)
  } catch (err) {
    console.error('[Chat] Erro ao buscar conversas:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}