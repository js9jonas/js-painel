// src/proxy.ts  ← Next.js 16 renomeou middleware.ts para proxy.ts
import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { pathname } = req.nextUrl

  // Libera rotas internas da API com token secreto (ex: n8n, cron)
  const internalToken = req.headers.get('x-internal-token')
  if (
    pathname.startsWith('/api/') &&
    internalToken === process.env.INTERNAL_API_TOKEN
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

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
}