import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'

export const dynamic = 'force-dynamic'

// Autorização já garantida pelo proxy.ts (bypass genérico de rota interna via
// header x-internal-token === INTERNAL_API_TOKEN, mesmo mecanismo usado por
// outras chamadas de cron/n8n) — não precisa checar de novo aqui.
const ID_SERVIDOR_CENTRAL = 2

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json()
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Campo obrigatório: token' }, { status: 400 })
    }

    const expiry = new Date(Date.now() + 55 * 60 * 1000)
    await pool.query(
      `UPDATE public.servidores SET session_cookie = $1, session_expiry = $2 WHERE id_servidor = $3`,
      [token, expiry, ID_SERVIDOR_CENTRAL]
    )

    console.log(`[Central] Token renovado via script local. Expira em: ${expiry.toISOString()}`)
    return NextResponse.json({ success: true, expiry: expiry.toISOString() })
  } catch (err) {
    console.error('[Central] Erro ao salvar token:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
