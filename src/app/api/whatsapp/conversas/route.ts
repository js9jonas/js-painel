// src/app/api/whatsapp/conversas/route.ts
import { NextResponse } from 'next/server'
import { pool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const result = await pool.query(`
      SELECT
        wm.telefone,
        MAX(wm.nome_contato)  AS nome_contato,
        MAX(ct.id_cliente)    AS id_cliente,
        MAX(c.nome)           AS nome_cliente,
        MAX(ct.foto_url)      AS foto_url,
        MAX(wm.recebida_em)   AS ultima_mensagem_em,
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
        COUNT(*) FILTER (
          WHERE wm.origem = 'cliente'
            AND wm.recebida_em > COALESCE((
              SELECT MAX(m2.recebida_em) FROM public.whatsapp_mensagens m2
              WHERE m2.telefone = wm.telefone AND m2.origem != 'cliente'
            ), '1970-01-01')
        ) AS nao_lidas
      FROM public.whatsapp_mensagens wm
      LEFT JOIN public.contatos ct ON (
        ct.telefone = wm.telefone
        OR ct.telefone = SUBSTRING(wm.telefone, 3)
        OR ct.telefone = SUBSTRING(wm.telefone, 3, 2) || '9' || SUBSTRING(wm.telefone, 5)
      )
      LEFT JOIN public.clientes c ON c.id_cliente = ct.id_cliente
      GROUP BY wm.telefone
      ORDER BY ultima_mensagem_em DESC
    `)

    return NextResponse.json(result.rows)
  } catch (err) {
    console.error('[Chat] Erro ao buscar conversas:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}