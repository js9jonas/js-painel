// src/proxy.ts  ← Next.js 16 renomeou middleware.ts para proxy.ts
import { auth } from "@/auth"
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server"
import { registrarChaveIdempotencia } from "@/lib/idempotencia"
import { HOST_CLIENTE } from "@/lib/enderecos"
import { dentroDoLimite, ipDoVisitante } from "@/lib/limite-requisicoes"

// Dois endereços no mesmo app (18/10/2026):
// - painel.jssistemas.online: o painel de gestão (login Google);
// - cliente.jssistemas.online: só as páginas públicas do cliente (/pagar). Endereço separado =
//   origem separada: os cookies de login do painel (__Host-/__Secure-, presos ao endereço exato)
//   nunca chegam aqui, então um defeito numa página pública não age com a sessão do Jonas.
//   Neste endereço não passa pelo login (nem pelo next-auth) e o que não for do cliente é 404.
export default function proxy(req: NextRequest, ev: NextFetchEvent) {
  const { pathname } = req.nextUrl
  if (hostDaRequisicao(req) === HOST_CLIENTE) return proxyCliente(req)

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

// Limites por IP no endereço do cliente (avisar o Jonas se mudar). Ao passar: 429 com mensagem simples.
// - abrir a página: 30/min (recarregar várias vezes ainda cabe)
// - gerar Pix: 10 a cada 10 min (o teto de 20 cobranças/dia por cliente segue valendo, em pix-link.ts)
// - "já pagou?": 40/min (a tela pergunta a cada 5 s = 12/min; cabe 3 abas abertas)
const LIMITES_CLIENTE = {
  pagina: { maximo: 30, janelaMs: 60_000 },
  gerar: { maximo: 10, janelaMs: 10 * 60_000 },
  situacao: { maximo: 40, janelaMs: 60_000 },
}

function proxyCliente(req: NextRequest) {
  const { pathname } = req.nextUrl
  const ehPagina = pathname.startsWith('/pagar/')
  const ehApi = pathname.startsWith('/api/pagar/')

  let res: NextResponse
  if (!ehPagina && !ehApi) {
    res = new NextResponse('Página não encontrada', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  } else {
    // /api/pagar/<token> = gerar Pix; /api/pagar/<token>/<txid> = "já pagou?"
    const tipo: keyof typeof LIMITES_CLIENTE = ehPagina
      ? 'pagina'
      : pathname.split('/').filter(Boolean).length >= 4 ? 'situacao' : 'gerar'
    const { maximo, janelaMs } = LIMITES_CLIENTE[tipo]
    const ip = ipDoVisitante(req.headers.get('x-forwarded-for'))
    if (dentroDoLimite(`${tipo}:${ip}`, maximo, janelaMs)) {
      res = NextResponse.next()
    } else {
      const msg = 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.'
      res = ehApi
        ? NextResponse.json({ erro: msg }, { status: 429 })
        : new NextResponse(msg, { status: 429, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      res.headers.set('Retry-After', String(Math.ceil(janelaMs / 1000)))
    }
  }
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