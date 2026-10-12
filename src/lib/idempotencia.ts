// src/lib/idempotencia.ts
import { pool } from "@/lib/db"

// Formato aceito: UUID (crypto.randomUUID) ou o reserva de IdempotenciaFetch — nada de texto livre na tabela
const FORMATO_CHAVE = /^[A-Za-z0-9-]{16,64}$/

/**
 * Registra a chave de idempotência de uma requisição. Retorna:
 * - 'nova': primeira vez — a requisição segue;
 * - 'repetida': a mesma chave já passou (navegador reenviando a mesma requisição) — recusar;
 * - 'ignorada': sem chave válida ou banco indisponível — segue sem proteção (recurso acessório:
 *   uma falha aqui nunca bloqueia a ação principal).
 */
export async function registrarChaveIdempotencia(
  chave: string | null,
  usuario: string | null,
  metodo: string,
  rota: string
): Promise<"nova" | "repetida" | "ignorada"> {
  if (!chave || !FORMATO_CHAVE.test(chave)) return "ignorada"
  try {
    const r = await pool.query(
      `INSERT INTO public.idempotencia_chaves (chave, usuario, metodo, rota)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (chave) DO UPDATE
         SET repeticoes = public.idempotencia_chaves.repeticoes + 1, ultima_repeticao = now()
       RETURNING repeticoes`,
      [chave, usuario, metodo, rota.slice(0, 300)]
    )
    if (Math.random() < 0.01) limparChavesAntigas()
    return r.rows[0].repeticoes > 0 ? "repetida" : "nova"
  } catch (err) {
    console.error("[idempotencia] falha ao registrar chave, seguindo sem proteção:", err)
    return "ignorada"
  }
}

function limparChavesAntigas() {
  pool
    .query(
      `DELETE FROM public.idempotencia_chaves
       WHERE criado_em < now() - CASE WHEN repeticoes > 0 THEN interval '90 days' ELSE interval '7 days' END`
    )
    .catch((err) => console.error("[idempotencia] falha na limpeza:", err))
}
