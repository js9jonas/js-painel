"use client"

// Põe um Idempotency-Key novo (UUID) em toda requisição que altera dados enviada ao próprio painel
// (fetch POST/PUT/PATCH/DELETE — inclusive server actions, que usam o fetch global). Se o navegador
// reenviar a MESMA requisição (aconteceu ao retomar a aba: templates mandados 2x em 12/10/2026), ela
// chega com a mesma chave e o proxy recusa (src/proxy.ts + src/lib/idempotencia.ts). Clique novo =
// chamada nova = chave nova, então ação repetida de propósito continua funcionando.
// Roda ao carregar o módulo (antes de qualquer efeito), uma vez só por janela.

const CABECALHO = "Idempotency-Key"
const METODOS_SEM_CHAVE = new Set(["GET", "HEAD", "OPTIONS"])

function novaChave(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

if (typeof window !== "undefined" && !(window as unknown as { __idempotencia?: boolean }).__idempotencia) {
  ;(window as unknown as { __idempotencia?: boolean }).__idempotencia = true
  const fetchOriginal = window.fetch.bind(window)

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const ehRequest = typeof Request !== "undefined" && input instanceof Request
      const metodo = (init?.method ?? (ehRequest ? (input as Request).method : "GET")).toUpperCase()
      if (METODOS_SEM_CHAVE.has(metodo)) return fetchOriginal(input, init)

      const href = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url
      if (new URL(href, window.location.href).origin !== window.location.origin) return fetchOriginal(input, init)

      // Cópia dos cabeçalhos: nunca alterar o objeto de quem chamou (se ele reaproveitar o mesmo
      // objeto numa 2ª chamada de propósito, a chave não pode vir repetida)
      const headers = new Headers(init?.headers ?? (ehRequest ? (input as Request).headers : undefined))
      if (!headers.has(CABECALHO)) headers.set(CABECALHO, novaChave())
      return fetchOriginal(input, { ...init, headers })
    } catch {
      return fetchOriginal(input, init)
    }
  }
}

export default function IdempotenciaFetch() {
  return null
}
