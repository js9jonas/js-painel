import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

// Última vez que o Jonas orientou o cliente a desligar tudo da tomada (mensagem padrão
// "Reinicia Geral" e variações/reforços curtos, enviados pelo celular ou pelo chat).
// Critério deliberadamente largo: texto contendo "tomada" E "2 minutos" — cobre as duas versões
// da mensagem padrão e os reforços. Busca por telefone (id_cliente é NULL nessas mensagens) e só
// olha mensagens enviadas por mim (origem='jonas'), nunca o que o cliente escreveu.
// `dias` conta dias de calendário em America/Sao_Paulo (ontem à noite = 1, não 0).
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const telefone = req.nextUrl.searchParams.get('telefone') ?? ''
  if (!/^\d{8,15}$/.test(telefone)) {
    return NextResponse.json({ error: 'telefone inválido' }, { status: 400 })
  }

  const { rows } = await pool.query(
    `SELECT criado_em::text AS ultima_em,
            ((now() AT TIME ZONE 'America/Sao_Paulo')::date
             - (criado_em AT TIME ZONE 'America/Sao_Paulo')::date)::int AS dias
       FROM public.whatsapp_mensagens
      WHERE telefone = $1
        AND origem = 'jonas'
        AND tipo = 'text'
        AND conteudo ILIKE '%tomada%'
        AND conteudo ILIKE '%2 minutos%'
      ORDER BY criado_em DESC
      LIMIT 1`,
    [telefone]
  )

  if (rows.length === 0) return NextResponse.json({ ultimaEm: null, dias: null })
  return NextResponse.json({ ultimaEm: rows[0].ultima_em, dias: rows[0].dias })
}
