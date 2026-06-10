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
        conteudo, media_mime, nome_arquivo, origem, sugestao_ia, foi_aceita, mensagem_final,
        reply_to_wa_msg_id, reply_to_conteudo, reply_to_origem,
        reacao, status, source, recebida_em
      FROM public.whatsapp_mensagens
      WHERE telefone = $1
      ORDER BY recebida_em ASC
      LIMIT 200
    `, [telefone])

    // Dados do cliente vinculado via contatos
    const cliente = await pool.query(`
  SELECT
    c.id_cliente,
    c.nome,
    c.observacao,
    c.score_fidelidade,
    a.id_assinatura,
    a.id_plano,
    a.id_pacote,
    a.identificacao,
    a.observacao   AS assinatura_observacao,
    pl.tipo        AS plano,
    pac.contrato   AS pacote,
    a.status,
    a.venc_contrato,
    a.venc_contas,
    pl.valor,
    (
      SELECT s.codigo_publico
      FROM public.contas cn
      JOIN public.servidores s ON s.id_servidor = cn.id_servidor
      WHERE cn.id_assinatura = a.id_assinatura
        AND cn.removido_em IS NULL
      LIMIT 1
    ) AS servidor
  FROM public.contatos ct
  JOIN public.clientes c ON c.id_cliente = ct.id_cliente
  LEFT JOIN public.assinaturas a
    ON a.id_cliente = c.id_cliente
    AND a.status NOT IN ('cancelado', 'inativo')
  LEFT JOIN public.planos pl
    ON pl.id_plano = a.id_plano
  LEFT JOIN public.pacote pac
    ON pac.id_pacote = a.id_pacote
  WHERE (
    ct.telefone = $1
    OR ct.telefone = SUBSTRING($1, 3)
    OR ct.telefone = SUBSTRING($1, 3, 2) || '9' || SUBSTRING($1, 5)
  )
  ORDER BY a.venc_contrato ASC
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