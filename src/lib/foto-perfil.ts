import { pool } from '@/lib/db'

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID!
const TOKEN           = process.env.WHATSAPP_TOKEN!
const CACHE_DAYS      = 7

// Busca foto de perfil do contato via Meta API e armazena no banco.
// Retorna a URL ou null se não disponível.
export async function fetchFotoPerfil(telefone: string): Promise<string | null> {
  try {
    const cached = await pool.query<{ foto_url: string | null; foto_at: Date | null }>(
      `SELECT foto_url, foto_at FROM public.contatos WHERE (
        telefone = $1
        OR telefone = SUBSTRING($1, 3)
        OR telefone = SUBSTRING($1, 3, 2) || '9' || SUBSTRING($1, 5)
      ) LIMIT 1`,
      [telefone]
    )

    if (cached.rows.length > 0) {
      const { foto_url, foto_at } = cached.rows[0]
      const age = foto_at ? (Date.now() - new Date(foto_at).getTime()) / 86400000 : Infinity
      if (age < CACHE_DAYS) return foto_url
    }

    const url = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/contacts/${telefone}?fields=profile_picture_url`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      signal: AbortSignal.timeout(5000),
    })

    let fotoUrl: string | null = null
    if (res.ok) {
      const data = await res.json()
      fotoUrl = data?.profile_picture_url ?? null
    }

    await pool.query(
      `UPDATE public.contatos SET foto_url = $1, foto_at = NOW()
       WHERE (
         telefone = $2
         OR telefone = SUBSTRING($2, 3)
         OR telefone = SUBSTRING($2, 3, 2) || '9' || SUBSTRING($2, 5)
       )`,
      [fotoUrl, telefone]
    )

    return fotoUrl
  } catch {
    return null
  }
}
