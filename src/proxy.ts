// src/proxy.ts  ← Next.js 16 renomeou middleware.ts para proxy.ts
import { auth } from "@/auth"
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server"
import { registrarChaveIdempotencia } from "@/lib/idempotencia"
import { HOST_CLIENTE } from "@/lib/enderecos"

// Dois endereços no mesmo app (18/10/2026):
// - painel.jssistemas.online: o painel de gestão (login Google);
// - cliente.jssistemas.online: só as páginas públicas do cliente (/pagar). Endereço separado =
//   origem separada: os cookies de login do painel (__Host-/__Secure-, presos ao endereço exato)
//   nunca chegam aqui, então um defeito numa página pública não age com a sessão do Jonas.
//   Neste endereço não passa pelo login (nem pelo next-auth) e o que não for do cliente é 404.
export default function proxy(req: NextRequest, ev: NextFetchEvent) {
  const { pathname } = req.nextUrl
  if (hostDaRequisicao(req) === HOST_CLIENTE) return proxyCliente(pathname)

  // Rotas do next-auth e arquivos do "Instalar app" (o Chrome lê antes do login) seguem direto
  if (
    pathname.startsWith('/api/auth/') ||
    pathname === '/manifest.webmanifest' ||
    pathname.startsWith('/icons/')
  ) {
    return NextResponse.next()
  }

  // Link de pagamento aberto no endereço do painel (links enviados antes de 18/10/2026) → endereço do cliente
  if (pathname.startsWith('/pagar/')) {
    return NextResponse.redirect(`https://${HOST_CLIENTE}${pathname}`, 308)
  }

  return proxyPainel(req, ev)
}

// Host pelo cabeçalho Host (o Traefik repassa o original). Não usar req.nextUrl: com AUTH_URL
// definido, o next-auth pode reescrever a origem da requisição pro endereço do painel.
function hostDaRequisicao(req: NextRequest): string {
  return (req.headers.get('host') ?? '').split(':')[0].trim().toLowerCase()
}

const CABECALHOS_CLIENTE: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
}

function proxyCliente(pathname: string) {
  const permitido = pathname.startsWith('/pagar/') || pathname.startsWith('/api/pagar/')
  const res = permitido
    ? NextResponse.next()
    : new NextResponse('Página não encontrada', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  for (const [k, v] of Object.entries(CABECALHOS_CLIENTE)) res.headers.set(k, v)
  return res
}

const proxyPainel = auth(async (req) => {
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
    pathname.startsWith('/api/inter/webhook/') ||  // segredo na URL + reconsulta no Inter (src/lib/pix-webhook.ts)
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

  // Requisição repetida pelo navegador (mesma Idempotency-Key, posta por src/components/IdempotenciaFetch.tsx)
  // não chega na rota: sem isso o servidor executa de novo mesmo com o navegador já tendo desistido (499).
  if (isLoggedIn && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const resultado = await registrarChaveIdempotencia(
      req.headers.get('idempotency-key'),
      req.auth?.user?.email ?? null,
      req.method,
      pathname
    )
    if (resultado === 'repetida') {
      console.warn(`[idempotencia] requisição repetida recusada: ${req.method} ${pathname}`)
      return NextResponse.json(
        { error: 'Essa ação já foi feita. O navegador tentou enviar de novo e foi bloqueado.' },
        { status: 409 }
      )
    }
  }

  return NextResponse.next()
}) as unknown as (req: NextRequest, ev: NextFetchEvent) => Promise<Response | undefined>

// Consumidores (28/09/2026): cron local central_refresh_token.js → /api/interno/central-token.
// (As rotas m3u-* do n8n saíram junto com os testes M3U — ver
// docs/memoria/project_m3u_testes_player_removidos.md.)
const ROTAS_TOKEN_INTERNO = new Set<string>([])

function rotaAceitaTokenInterno(pathname: string): boolean {
  return pathname.startsWith('/api/interno/') || ROTAS_TOKEN_INTERNO.has(pathname)
}

export const config = {
  // api/auth, manifest.webmanifest e /icons/ entram no matcher pra o endereço do cliente poder
  // recusá-los; no endereço do painel eles seguem direto, sem login (ver o início de proxy()).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}