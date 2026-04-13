// src/app/api/stream-proxy/route.ts
// Proxy leve para contornar CORS em streams IPTV
// Para M3U8: reescreve URLs de segmentos para também passarem pelo proxy

import { NextRequest, NextResponse } from 'next/server'

const IPTV_USER_AGENT = 'Lavf/58.76.100'

function rewriteM3U8(content: string, sourceUrl: string, proxyBase: string): string {
  const lines = content.split('\n')
  return lines.map(line => {
    const trimmed = line.trim()
    if (!trimmed) return line

    // Reescreve URI= dentro de tags como #EXT-X-KEY, #EXT-X-MEDIA, etc.
    if (trimmed.startsWith('#') && trimmed.includes('URI="')) {
      return line.replace(/URI="([^"]*)"/g, (_, uri) => {
        if (!uri) return `URI=""`
        try {
          const abs = uri.startsWith('http://') || uri.startsWith('https://')
            ? uri
            : new URL(uri, sourceUrl).href
          return `URI="${proxyBase}?url=${encodeURIComponent(abs)}"`
        } catch {
          return `URI="${uri}"`
        }
      })
    }

    if (trimmed.startsWith('#')) return line

    // Linha de URL de segmento ou sub-playlist
    let absoluteUrl: string
    try {
      absoluteUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? trimmed
        : new URL(trimmed, sourceUrl).href
    } catch {
      return line
    }

    return `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`
  }).join('\n')
}

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get('url')
  if (!rawUrl) {
    return NextResponse.json({ error: 'Parâmetro url é obrigatório' }, { status: 400 })
  }

  let decoded: string
  try {
    decoded = decodeURIComponent(rawUrl)
  } catch {
    return NextResponse.json({ error: 'URL inválida' }, { status: 400 })
  }

  if (!decoded.startsWith('http://') && !decoded.startsWith('https://')) {
    return NextResponse.json({ error: 'Apenas URLs http/https são permitidas' }, { status: 400 })
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 30_000)

    const upstream = await fetch(decoded, {
      signal: controller.signal,
      headers: { 'User-Agent': IPTV_USER_AGENT },
      cache: 'no-store',
    })

    clearTimeout(timer)

    const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream'

    const corsHeaders: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    }

    // Detecta M3U8 por content-type ou URL — mas também lê o body para confirmar
    // (sub-playlists Xtream podem não ter .m3u8 na URL nem content-type correto)
    const podeSerM3U8 =
      contentType.includes('mpegurl') ||
      contentType.includes('text/') ||
      decoded.includes('.m3u8') ||
      decoded.includes('/index.m3u8') ||
      !contentType.includes('video') && !contentType.includes('audio') && !contentType.includes('octet-stream')

    if (podeSerM3U8) {
      const text = await upstream.text()
      const inicio = text.trimStart()

      if (inicio.startsWith('#EXTM3U') || inicio.startsWith('#EXT-X-')) {
        // Caminho relativo — evita problemas com IPv6 (::1) e origens inesperadas
        const proxyBase = '/api/stream-proxy'
        const rewritten = rewriteM3U8(text, decoded, proxyBase)

        return new NextResponse(rewritten, {
          status: upstream.status,
          headers: {
            'Content-Type': 'application/vnd.apple.mpegurl',
            ...corsHeaders,
          },
        })
      }

      // Não é M3U8 — devolve o texto como estava
      return new NextResponse(text, {
        status: upstream.status,
        headers: { 'Content-Type': contentType, ...corsHeaders },
      })
    }

    // Conteúdo binário (segmentos .ts, etc.) — stream direto sem buffer
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        'Content-Type': contentType,
        ...corsHeaders,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('abort')) {
      return NextResponse.json({ error: 'Timeout ao buscar stream' }, { status: 504 })
    }
    return NextResponse.json({ error: `Proxy error: ${msg}` }, { status: 502 })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  })
}
