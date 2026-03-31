import { auth } from '@/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const { pathname } = req.nextUrl

  // Webhook do WhatsApp — sem autenticação
  if (pathname.startsWith('/api/whatsapp/webhook')) {
    return NextResponse.next()
  }

  // Demais rotas — comportamento padrão do NextAuth
  if (!req.auth && !pathname.startsWith('/login')) {
    const loginUrl = new URL('/login', req.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}