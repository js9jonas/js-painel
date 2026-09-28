// src/proxy.ts  ← Next.js 16 renomeou middleware.ts para proxy.ts
import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { pathname } = req.nextUrl

  // Rotas públicas
  if (pathname === '/privacidade' || pathname.startsWith('/privacidade/')) {
    return NextResponse.next()
  }

  if (pathname === '/sobre' || pathname.startsWith('/sobre/')) {
    return NextResponse.next()
  }

  if (
    pathname.startsWith('/api/whatsapp/webhook') ||
    pathname.startsWith('/api/whatsapp/registrar') ||
    pathname.startsWith('/api/typebot/') ||
    pathname.startsWith('/stickers/')
  ) {
    return NextResponse.next()
  }

  // Libera rotas internas da API com token secreto (ex: n8n, cron) — SÓ as listadas.
  // Antes valia pra qualquer /api/*: um vazamento do token (aconteceu, ver
  // docs/memoria/incident_segredos_repo_publico_28set2026.md) abria a API inteira.
  // Rota nova chamada por n8n/cron com esse header precisa entrar aqui.
  const internalToken = req.headers.get('x-internal-token')
  if (
    internalToken &&
    internalToken === process.env.INTERNAL_API_TOKEN &&
    rotaAceitaTokenInterno(pathname)
  ) {
    return NextResponse.next()
  }

  const isLoggedIn = !!req.auth
  const isLoginPage = pathname === "/login"

  // Não logado tentando acessar rota protegida → redireciona para login
  if (!isLoggedIn && !isLoginPage) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  // Já logado tentando acessar login → redireciona para dashboard
  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }

  return NextResponse.next()
})

// Consumidores (28/09/2026): cron local central_refresh_token.js → /api/interno/central-token.
// (As rotas m3u-* do n8n saíram junto com os testes M3U — ver
// docs/memoria/project_m3u_testes_player_removidos.md.)
const ROTAS_TOKEN_INTERNO = new Set<string>([])

function rotaAceitaTokenInterno(pathname: string): boolean {
  return pathname.startsWith('/api/interno/') || ROTAS_TOKEN_INTERNO.has(pathname)
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
}