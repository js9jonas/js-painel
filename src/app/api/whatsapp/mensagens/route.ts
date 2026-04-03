// src/app/api/whatsapp/mensagens/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const telefone = searchParams.get('telefone')

  if (!telefone) {
    return NextResponse.json({ error: 'telefone obrigatório' }, { status: 400 })
  }

  try {
    // Mensagens da conversa
    const mensagens = await pool.query(`
      SELECT
        id, wa_msg_id, telefone, nome_contato, tipo,
        conteudo, origem, sugestao_ia, foi_aceita, mensagem_final,
        status, recebida_em
      FROM public.whatsapp_mensagens
      WHERE telefone = $1
      ORDER BY recebida_em ASC
      LIMIT 200
    `, [telefone])

    // Dados do cliente vinculado
    const cliente = await pool.query(`
      SELECT
        c.id_cliente,
        c.nome,
        c.observacao,
        c.score_fidelidade,
        a.id_assinatura,
        pl.tipo        AS plano,
        a.status,
        a.venc_contrato,
        a.venc_contas,
        pl.valor,
        s.nome_interno AS servidor
      FROM public.clientes c
      LEFT JOIN public.assinaturas a
        ON a.id_cliente = c.id_cliente
        AND a.status NOT IN ('cancelado', 'inativo')
      LEFT JOIN public.planos pl
        ON pl.id_plano = a.id_plano
      LEFT JOIN public.servidores s
        ON s.id_servidor = a.id_servidor
      WHERE c.id_cliente = (
        SELECT id_cliente
        FROM public.whatsapp_mensagens
        WHERE telefone = $1
          AND id_cliente IS NOT NULL
        LIMIT 1
      )
      ORDER BY a.venc_contas ASC
      LIMIT 1
    `, [telefone])

    return NextResponse.json({
      mensagens: mensagens.rows,
      cliente: cliente.rows[0] ?? null
    })
  } catch (err) {
    console.error('[Chat] Erro ao buscar mensagens:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}