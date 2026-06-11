import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'
import { auth } from '@/auth'

export const dynamic = 'force-dynamic'

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.respostas_rapidas (
      id        SERIAL PRIMARY KEY,
      atalho    TEXT NOT NULL,
      titulo    TEXT NOT NULL,
      texto     TEXT NOT NULL,
      ordem     INTEGER NOT NULL DEFAULT 0,
      ativo     BOOLEAN NOT NULL DEFAULT true,
      criado_em TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM public.respostas_rapidas`)
  if (rows[0].n === 0) {
    await pool.query(`
      INSERT INTO public.respostas_rapidas (atalho, titulo, texto, ordem) VALUES
        ('p',   'Chave PIX',   'Segue nossa chave PIX (CNPJ): 40.827.286/0001-06', 1),
        ('oi',  'Saudação',    'Olá! Aqui é o Jonas da JS Sistemas. Como posso ajudar? 👋', 2),
        ('ok',  'Confirmação', 'Perfeito! Qualquer dúvida é só chamar. 😊', 3),
        ('ag',  'Aguarde',     'Olá! Já vou verificar para você, um momento por favor. 🔎', 4),
        ('ren', 'Renovado',    'Confirmado! Sua assinatura foi renovada. Aproveite! 🎉', 5),
        ('ven', 'Vencendo',    'Olá! Sua assinatura está próxima do vencimento. Entre em contato para renovar. 📅', 6)
    `)
  }
}

export async function GET(_req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  await ensureTable()
  const { rows } = await pool.query(
    `SELECT id, atalho, titulo, texto, ordem, ativo FROM public.respostas_rapidas ORDER BY ordem ASC, id ASC`
  )
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  await ensureTable()
  const { atalho, titulo, texto, ordem } = await req.json()
  if (!atalho?.trim() || !titulo?.trim() || !texto?.trim()) {
    return NextResponse.json({ error: 'atalho, titulo e texto obrigatórios' }, { status: 400 })
  }
  const { rows } = await pool.query(
    `INSERT INTO public.respostas_rapidas (atalho, titulo, texto, ordem)
     VALUES ($1, $2, $3, $4) RETURNING id, atalho, titulo, texto, ordem, ativo`,
    [atalho.trim().toLowerCase(), titulo.trim(), texto.trim(), ordem ?? 0]
  )
  return NextResponse.json(rows[0])
}
