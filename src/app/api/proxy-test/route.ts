// src/app/api/proxy-test/route.ts
// Diagnóstico do proxy — NÃO usar em produção
import { NextRequest, NextResponse } from 'next/server'

const UA = 'Lavf/58.76.100'

function rewriteM3U8(content: string, sourceUrl: string, proxyBase: string): string {
  const lines = content.split('\n')
  let rewritten = 0
  const out = lines.map(line => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return line
    let absoluteUrl: string
    try {
      absoluteUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? trimmed
        : new URL(trimmed, sourceUrl).href
    } catch {
      return line
    }
    rewritten++
    return `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`
  }).join('\n')
  return JSON.stringify({ out, rewritten })
}

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get('url')
  if (!rawUrl) {
    return NextResponse.json({ erro: 'Parâmetro url ausente' }, { status: 400 })
  }

  let decoded: string
  try { decoded = decodeURIComponent(rawUrl) } catch {
    return NextResponse.json({ erro: 'URL inválida' }, { status: 400 })
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)

    const upstream = await fetch(decoded, {
      signal: controller.signal,
      headers: { 'User-Agent': UA },
      cache: 'no-store',
    })
    clearTimeout(timer)

    const contentType = upstream.headers.get('content-type') ?? '(ausente)'
    const responseHeaders: Record<string, string> = {}
    upstream.headers.forEach((v, k) => { responseHeaders[k] = v })

    const buffer = await upstream.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const primeiros200 = bytes.slice(0, 200)
    const primeirosBytesBase64 = Buffer.from(primeiros200).toString('base64')
    const bodyTexto = new TextDecoder().decode(bytes)
    const inicio = bodyTexto.trimStart()

    const isM3U8Detectado =
      contentType.includes('mpegurl') ||
      contentType.includes('text/') ||
      decoded.includes('.m3u8') ||
      inicio.startsWith('#EXTM3U') ||
      inicio.startsWith('#EXT-X-')

    let linhasReescritas = 0
    let primeiraLinhasM3U8: string[] = []

    if (isM3U8Detectado) {
      const origin = new URL(req.url).origin
      const proxyBase = `${origin}/api/stream-proxy`
      const resultado = JSON.parse(rewriteM3U8(bodyTexto, decoded, proxyBase))
      linhasReescritas = resultado.rewritten
      primeiraLinhasM3U8 = bodyTexto.split('\n').slice(0, 20)
    }

    return NextResponse.json({
      status: upstream.status,
      contentType,
      responseHeaders,
      primeirosBytesBase64,
      primeirosBytesTexto: bodyTexto.slice(0, 500),
      isM3U8Detectado,
      linhasReescritas,
      primeiraLinhasM3U8,
      erro: null,
    })
  } catch (err) {
    return NextResponse.json({
      status: null,
      contentType: null,
      primeirosBytesBase64: null,
      isM3U8Detectado: false,
      linhasReescritas: 0,
      erro: err instanceof Error ? err.message : String(err),
    })
  }
}
