// src/lib/m3u-tester.ts
import { pool } from '@/lib/db'
import crypto from 'crypto'

// ─── User-Agent padrão ────────────────────────────────────────────────────────
// Lavf/58.76.100 (ffmpeg) é reconhecido por todos os servidores IPTV
const IPTV_USER_AGENT = 'Lavf/58.76.100'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ResultadoTeste {
  lista_id: number
  status: 'online' | 'offline' | 'timeout' | 'erro'
  ping_ms: number | null
  jitter_ms: number | null
  perda_pacotes_pct: number | null
  http_status: number | null
  ttfb_ms: number | null
  velocidade_kbps: number | null
  tamanho_lista_kb: number | null
  tempo_download_ms: number | null
  erro_mensagem: string | null
  // Teste de stream
  stream_canal_nome: string | null
  stream_ttfb_ms: number | null
  stream_throughput_kbps: number | null
  stream_consistencia_pct: number | null
  stream_duracao_s: number | null
  stream_status: 'ok' | 'lento' | 'falhou' | 'sem_canal' | null
}

interface EntradaM3U {
  tvg_id: string
  nome: string
  grupo: string
  logo_url: string
  duracao: number
  tipo: 'canal' | 'filme' | 'serie'
}

interface ContagensM3U {
  total_canais: number
  total_filmes: number
  total_series: number
  total_geral: number
  grupos: Record<string, number>
}

// ─── Xtream Codes API ────────────────────────────────────────────────────────

interface XtreamCredentials {
  host: string
  username: string
  password: string
}

function extrairCredenciaisXtream(url: string): XtreamCredentials | null {
  try {
    const u = new URL(url)
    const username = u.searchParams.get('username')
    const password = u.searchParams.get('password')
    if (!username || !password || !u.pathname.includes('get.php')) return null
    return { host: `${u.protocol}//${u.host}`, username, password }
  } catch {
    return null
  }
}

async function buscarCountsXtream(creds: XtreamCredentials): Promise<{
  total_canais: number
  total_filmes: number
  total_series: number
  total_geral: number
} | null> {
  const base = `${creds.host}/player_api.php?username=${creds.username}&password=${creds.password}`
  const timeout = 30_000

  try {
    const fetchJson = async (action: string) => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeout)
      try {
        const res = await fetch(`${base}&action=${action}`, {
          signal: controller.signal,
          cache: 'no-store',
          headers: { 'User-Agent': IPTV_USER_AGENT },
        })
        if (!res.ok) return null
        return await res.json()
      } finally {
        clearTimeout(timer)
      }
    }

    const [live, vod, series] = await Promise.all([
      fetchJson('get_live_streams'),
      fetchJson('get_vod_streams'),
      fetchJson('get_series'),
    ])

    if (!Array.isArray(live) || !Array.isArray(vod) || !Array.isArray(series)) return null

    return {
      total_canais: live.length,
      total_filmes: vod.length,
      total_series: series.length,
      total_geral: live.length + vod.length + series.length,
    }
  } catch (err) {
    console.error('[m3u-tester] Erro ao buscar counts Xtream:', err)
    return null
  }
}

// ─── Classificador ────────────────────────────────────────────────────────────

function classificarTipo(duracao: number, _tvgId: string, grupo: string): 'canal' | 'filme' | 'serie' {
  const g = grupo.toLowerCase()

  if (g.startsWith('canais |') || g.startsWith('canais|')) return 'canal'
  if (g.startsWith('filmes |') || g.startsWith('filmes/') || g.startsWith('filmes|')) return 'filme'
  if (g.startsWith('series |') || g.startsWith('series|')) return 'serie'

  const plataformas = [
    'netflix', 'globoplay', 'amazon prime', 'hbo max', 'hbomax',
    'disney+', 'star+', 'star plus', 'paramount+', 'apple tv', 'appletv+',
    'crunchyroll', 'funimation', 'lionsgate', 'oldflix', 'pluto',
    'looke', 'peacock', 'discovery+', 'max',
  ]
  if (plataformas.some(p => g.includes(p))) return 'serie'

  const termsSerie = [
    'serie', 'novela', 'dorama', 'anime', 'temporada',
    'season', 'episod', 'tvshow', 'reelshort',
    'filmes e series', 'filmes & series',
    'lancamentos legendados', 'legendado',
    'desenho', 'shorts', 'show', 'variedade',
    'infantis', 'infantil', 'especial',
    'marvel', 'dc ', 'dc+',
    '18+', 'adulto', 'porno', 'hentai',
    'brasil paralelo', 'uhd 4k', 'h265', 'hevc',
    'youtube', 'jogos youtube',
  ]
  if (termsSerie.some(t => g.includes(t))) return 'serie'

  const termsFilme = [
    'terror', 'suspense', 'romance', 'faroeste', 'guerra',
    'fantasia', 'aventura', 'documentar', 'animacao',
    'lancamento', 'nacional', 'cinema',
    'drama', 'comedia', 'acao', 'thriller', 'ficcao',
  ]
  if (termsFilme.some(t => g.includes(t))) return 'filme'

  if (duracao === -1) return 'canal'
  return 'serie'
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parsearEntradas(conteudo: string): EntradaM3U[] {
  const entradas: EntradaM3U[] = []
  const linhas = conteudo.split('\n')

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i].trim()
    if (!linha.startsWith('#EXTINF')) continue

    const duracaoMatch = linha.match(/^#EXTINF:\s*(-?\d+)/)
    const duracao = duracaoMatch ? parseInt(duracaoMatch[1]) : -1
    const tvgId = linha.match(/tvg-id="([^"]*)"/)?.[1]?.trim() ?? ''
    const tvgName = linha.match(/tvg-name="([^"]*)"/)?.[1]?.trim() ?? ''
    const grupo = linha.match(/group-title="([^"]*)"/)?.[1]?.trim() ?? 'Sem grupo'
    const logo = linha.match(/tvg-logo="([^"]*)"/)?.[1]?.trim() ?? ''
    const nomeRaw = tvgName || (linha.split(',').pop()?.trim() ?? '')

    const tipo = classificarTipo(duracao, tvgId, grupo)

    entradas.push({ tvg_id: tvgId, nome: nomeRaw, grupo, logo_url: logo, duracao, tipo })
  }

  return entradas
}

// ─── Contagens ────────────────────────────────────────────────────────────────

function gerarContagens(entradas: EntradaM3U[]): ContagensM3U {
  const grupos: Record<string, number> = {}
  let canais = 0, filmes = 0, series = 0

  for (const e of entradas) {
    if (e.tipo === 'canal') canais++
    else if (e.tipo === 'filme') filmes++
    else series++
    grupos[e.grupo] = (grupos[e.grupo] || 0) + 1
  }

  return {
    total_canais: canais,
    total_filmes: filmes,
    total_series: series,
    total_geral: canais + filmes + series,
    grupos,
  }
}

// ─── Rede: host ───────────────────────────────────────────────────────────────

function extrairHost(url: string): string {
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.host}`
  } catch {
    return url
  }
}

// ─── Rede: ping ───────────────────────────────────────────────────────────────

async function medirLatencia(url: string, timeoutMs = 5000): Promise<number | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const inicio = Date.now()
  try {
    await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'User-Agent': IPTV_USER_AGENT },
    })
    return Date.now() - inicio
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function medirPing(urlHost: string, repeticoes = 5, timeoutMs = 5000) {
  const tempos: number[] = []
  let falhas = 0

  for (let i = 0; i < repeticoes; i++) {
    const t = await medirLatencia(urlHost, timeoutMs)
    if (t !== null) tempos.push(t)
    else falhas++
    if (i < repeticoes - 1) await new Promise(r => setTimeout(r, 200))
  }

  const perda = (falhas / repeticoes) * 100
  if (tempos.length === 0) return { ping_ms: null, jitter_ms: null, perda_pacotes_pct: perda }

  return {
    ping_ms: Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length),
    jitter_ms: Math.round(Math.max(...tempos) - Math.min(...tempos)),
    perda_pacotes_pct: Math.round(perda * 10) / 10,
  }
}

// ─── Rede: download ───────────────────────────────────────────────────────────

async function medirDownload(urlM3u: string) {
  const TIMEOUT_TTFB = 20_000
  const TIMEOUT_BODY = 120_000

  const controller = new AbortController()
  const timerTtfb = setTimeout(() => controller.abort(), TIMEOUT_TTFB)

  const resultado = {
    http_status: null as number | null,
    ttfb_ms: null as number | null,
    velocidade_kbps: null as number | null,
    tamanho_lista_kb: null as number | null,
    tempo_download_ms: null as number | null,
    conteudo: null as string | null,
    erro_mensagem: null as string | null,
  }

  try {
    const inicioReq = Date.now()
    const response = await fetch(urlM3u, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'User-Agent': IPTV_USER_AGENT },
    })

    clearTimeout(timerTtfb)
    resultado.ttfb_ms = Date.now() - inicioReq
    resultado.http_status = response.status

    if (!response.ok) {
      resultado.erro_mensagem = `HTTP ${response.status}`
      return resultado
    }

    const controllerBody = new AbortController()
    const timerBody = setTimeout(() => controllerBody.abort(), TIMEOUT_BODY)

    try {
      const inicioBody = Date.now()
      const texto = await response.text()
      clearTimeout(timerBody)

      const tempoBody = Date.now() - inicioBody
      const tamanhoBytes = new TextEncoder().encode(texto).length

      resultado.tamanho_lista_kb = Math.round(tamanhoBytes / 1024)
      resultado.tempo_download_ms = tempoBody
      resultado.velocidade_kbps = tempoBody > 0
        ? Math.round((tamanhoBytes * 8) / (tempoBody / 1000) / 1000)
        : null
      resultado.conteudo = texto
    } catch {
      clearTimeout(timerBody)
    }
  } catch (err) {
    clearTimeout(timerTtfb)
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    resultado.erro_mensagem = msg.includes('abort')
      ? 'Timeout: servidor nao respondeu em 15s'
      : msg
  }

  return resultado
}

// ─── Determina status final ───────────────────────────────────────────────────
// 401 = credenciais inválidas mas servidor online
// 403 = acesso bloqueado mas servidor online
// >= 400 exceto 401/403 = offline

function determinarStatus(
  erroMensagem: string | null,
  httpStatus: number | null,
  perdaPacotes: number | null,
  ttfbMs: number | null
): ResultadoTeste['status'] {
  if (erroMensagem?.includes('Timeout')) return 'timeout'
  if (erroMensagem) return 'erro'
  if (!httpStatus) return 'offline'
  if (httpStatus === 401 || httpStatus === 403) return 'online'
  // 404 com TTFB baixo = servidor respondeu mas bloqueou (não é offline real)
  if (httpStatus === 404 && ttfbMs !== null && ttfbMs < 800) return 'online'
  if (httpStatus >= 400) return 'offline'
  if ((perdaPacotes ?? 0) >= 80) return 'offline'
  return 'online'
}

// ─── Snapshot + catálogo ──────────────────────────────────────────────────────

async function salvarSnapshotEConteudo(
  listaId: number,
  urlM3u: string,
  conteudo: string,
  indexarConteudo: boolean,
  credsExternas?: XtreamCredentials
) {
  const hash = crypto.createHash('md5').update(conteudo).digest('hex')

  const { rows: ultimos } = await pool.query(
    `SELECT id, hash_md5, total_canais, total_filmes, total_series, total_geral
     FROM m3u_snapshots WHERE lista_id = $1
     ORDER BY capturado_em DESC LIMIT 1`,
    [listaId]
  )

  const hashMudou = ultimos.length === 0 || ultimos[0].hash_md5 !== hash

  const creds = credsExternas ?? extrairCredenciaisXtream(urlM3u)
  const countsXtream = creds ? await buscarCountsXtream(creds) : null

  const precisaParsear = !countsXtream
  const entradas = precisaParsear ? parsearEntradas(conteudo) : []

  const contagens = countsXtream ?? gerarContagens(entradas)

  let diffAnterior = null
  if (ultimos.length > 0) {
    const prev = ultimos[0]
    diffAnterior = {
      canais: contagens.total_canais - (prev.total_canais || 0),
      filmes: contagens.total_filmes - (prev.total_filmes || 0),
      series: contagens.total_series - (prev.total_series || 0),
      total: contagens.total_geral - (prev.total_geral || 0),
    }
  }

  const { rows: novoSnapshot } = await pool.query(
    `INSERT INTO m3u_snapshots
      (lista_id, hash_md5, total_canais, total_filmes, total_series, total_geral, grupos, diff_anterior)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id`,
    [
      listaId, hash,
      contagens.total_canais, contagens.total_filmes,
      contagens.total_series, contagens.total_geral,
      JSON.stringify('grupos' in contagens ? contagens.grupos : {}),
      diffAnterior ? JSON.stringify(diffAnterior) : null,
    ]
  )

  const snapshotId = novoSnapshot[0].id

  if (indexarConteudo && hashMudou) {
    await pool.query('UPDATE m3u_conteudo SET ativo = false WHERE lista_id = $1', [listaId])

    const gruposUnicos = new Map<string, { tipo: string; grupo: string; nome: string }>()
    for (const e of entradas) {
      const chave = `${e.tipo}::${e.grupo}`
      if (!gruposUnicos.has(chave)) {
        gruposUnicos.set(chave, { tipo: e.tipo, grupo: e.grupo, nome: e.grupo })
      }
    }

    const grupos = Array.from(gruposUnicos.values())
    const LOTE = 500
    for (let i = 0; i < grupos.length; i += LOTE) {
      const lote = grupos.slice(i, i + LOTE)
      const valores: unknown[] = []
      const placeholders = lote.map((g, idx) => {
        const base = idx * 6
        valores.push(listaId, snapshotId, g.tipo, g.nome, g.grupo, true)
        return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6})`
      })

      await pool.query(
        `INSERT INTO m3u_conteudo
          (lista_id, snapshot_id, tipo, nome, grupo, ativo)
         VALUES ${placeholders.join(',')}
         ON CONFLICT DO NOTHING`,
        valores
      )
    }

    console.log(`[m3u-tester] Lista ${listaId}: ${grupos.length} grupos indexados no snapshot ${snapshotId}`)
  }
}

// ─── Teste rápido ─────────────────────────────────────────────────────────────

export async function testarListaRapido(listaId: number): Promise<ResultadoTeste> {
  const { rows } = await pool.query(
    'SELECT id, url_m3u FROM m3u_listas WHERE id = $1',
    [listaId]
  )
  if (rows.length === 0) throw new Error(`Lista ${listaId} nao encontrada`)

  const lista = rows[0]
  const urlHost = extrairHost(lista.url_m3u)

  const pingResult = await medirPing(urlHost, 3, 5000)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  let http_status: number | null = null
  let ttfb_ms: number | null = null
  let erro_mensagem: string | null = null

  try {
    const inicio = Date.now()
    const res = await fetch(lista.url_m3u, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'User-Agent': IPTV_USER_AGENT },
    })
    ttfb_ms = Date.now() - inicio
    http_status = res.status
    console.log(`[teste-rapido] lista ${listaId} → HTTP ${http_status} (ttfb: ${ttfb_ms}ms, host: ${urlHost})`)
    controller.abort()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    if (!msg.includes('abort') || http_status === null) {
      erro_mensagem = ttfb_ms === null ? 'Timeout: sem resposta em 15s' : msg
    }
  } finally {
    clearTimeout(timer)
  }

  const status = determinarStatus(erro_mensagem, http_status, pingResult.perda_pacotes_pct ?? null)

  const resultado: ResultadoTeste = {
    lista_id: listaId,
    status,
    ping_ms: pingResult.ping_ms,
    jitter_ms: pingResult.jitter_ms,
    perda_pacotes_pct: pingResult.perda_pacotes_pct ?? null,
    http_status,
    ttfb_ms,
    velocidade_kbps: null,
    tamanho_lista_kb: null,
    tempo_download_ms: null,
    erro_mensagem,
    stream_canal_nome: null,
    stream_ttfb_ms: null,
    stream_throughput_kbps: null,
    stream_consistencia_pct: null,
    stream_duracao_s: null,
    stream_status: null,
  }

  await pool.query(
    `INSERT INTO m3u_testes
      (lista_id, status, ping_ms, jitter_ms, perda_pacotes_pct,
       http_status, ttfb_ms, velocidade_kbps, tamanho_lista_kb,
       tempo_download_ms, erro_mensagem)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      resultado.lista_id, resultado.status, resultado.ping_ms,
      resultado.jitter_ms, resultado.perda_pacotes_pct, resultado.http_status,
      resultado.ttfb_ms, null, null, null, resultado.erro_mensagem,
    ]
  )

  await pool.query('UPDATE m3u_listas SET ultimo_teste_em = NOW() WHERE id = $1', [listaId])

  return resultado
}

// ─── Teste de Stream ──────────────────────────────────────────────────────────

async function buscarStreamCanal(
  creds: XtreamCredentials,
  termoBusca: string
): Promise<{ stream_id: number; nome: string } | null> {
  try {
    const url = `${creds.host}/player_api.php?username=${creds.username}&password=${creds.password}&action=get_live_streams`
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': IPTV_USER_AGENT },
    })
    if (!res.ok) return null
    const canais = await res.json() as Array<{ stream_id: number; name: string }>
    const termo = termoBusca.toLowerCase()
    const encontrado = canais.find(c => c.name.toLowerCase().includes(termo))
    return encontrado ? { stream_id: encontrado.stream_id, nome: encontrado.name } : null
  } catch {
    return null
  }
}

async function testarStream(
  creds: XtreamCredentials,
  streamId: number,
  duracaoS = 20
): Promise<{
  ttfb_ms: number | null
  throughput_kbps: number | null
  consistencia_pct: number | null
  status: 'ok' | 'lento' | 'falhou'
}> {
  const url = `${creds.host}/live/${creds.username}/${creds.password}/${streamId}.ts`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), (duracaoS + 10) * 1000)

  try {
    const inicio = Date.now()
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': IPTV_USER_AGENT },
    })

    if (!res.ok || !res.body) {
      return { ttfb_ms: null, throughput_kbps: null, consistencia_pct: null, status: 'falhou' }
    }

    const ttfb_ms = Date.now() - inicio

    const reader = res.body.getReader()
    const fimLeitura = Date.now() + duracaoS * 1000
    const janelas: number[] = []
    let bytesJanela = 0
    let inicioJanela = Date.now()

    while (Date.now() < fimLeitura) {
      const { done, value } = await reader.read()
      if (done) break
      bytesJanela += value.byteLength

      const agora = Date.now()
      if (agora - inicioJanela >= 2000) {
        const kbps = (bytesJanela * 8) / ((agora - inicioJanela))
        janelas.push(kbps)
        bytesJanela = 0
        inicioJanela = agora
      }
    }

    reader.cancel()

    if (janelas.length === 0) {
      return { ttfb_ms, throughput_kbps: null, consistencia_pct: null, status: 'falhou' }
    }

    const throughputMedio = janelas.reduce((a, b) => a + b, 0) / janelas.length
    const throughputMin = Math.min(...janelas)
    const consistencia_pct = Math.round((throughputMin / throughputMedio) * 100)

    const status = throughputMedio < 500
      ? 'lento'
      : consistencia_pct < 40
        ? 'lento'
        : 'ok'

    return {
      ttfb_ms,
      throughput_kbps: Math.round(throughputMedio),
      consistencia_pct,
      status,
    }
  } catch {
    return { ttfb_ms: null, throughput_kbps: null, consistencia_pct: null, status: 'falhou' }
  } finally {
    clearTimeout(timer)
  }
}

// ─── Teste completo ───────────────────────────────────────────────────────────

export async function testarLista(listaId: number): Promise<ResultadoTeste> {
  const { rows } = await pool.query(
    'SELECT id, url_m3u, tipo, host, usuario, senha, indexar_conteudo FROM m3u_listas WHERE id = $1',
    [listaId]
  )
  if (rows.length === 0) throw new Error(`Lista ${listaId} nao encontrada`)

  const lista = rows[0]
  const urlHost = extrairHost(lista.url_m3u)

  const [pingResult, downloadResult] = await Promise.all([
    medirPing(urlHost, 5, 5000),
    medirDownload(lista.url_m3u),
  ])

  console.log(`[teste-completo] lista ${listaId} → HTTP ${downloadResult.http_status} (ttfb: ${downloadResult.ttfb_ms}ms, host: ${urlHost})`)

  const status = determinarStatus(
    downloadResult.erro_mensagem,
    downloadResult.http_status,
    pingResult.perda_pacotes_pct ?? null
  )

  // Teste de stream (somente se online e tiver credenciais Xtream)
  const credsParaStream: XtreamCredentials | null =
    status === 'online'
      ? (lista.tipo === 'xtream' && lista.host && lista.usuario && lista.senha
        ? { host: lista.host, username: lista.usuario, password: lista.senha }
        : extrairCredenciaisXtream(lista.url_m3u))
      : null

  let streamCanalNome: string | null = null
  let streamTtfb: number | null = null
  let streamThroughput: number | null = null
  let streamConsistencia: number | null = null
  let streamDuracao: number | null = null
  let streamStatus: ResultadoTeste['stream_status'] = null

  if (credsParaStream) {
    const canal = await buscarStreamCanal(credsParaStream, 'telecine')
    if (canal) {
      streamCanalNome = canal.nome
      streamDuracao = 20
      const streamResult = await testarStream(credsParaStream, canal.stream_id, 20)
      streamTtfb = streamResult.ttfb_ms
      streamThroughput = streamResult.throughput_kbps
      streamConsistencia = streamResult.consistencia_pct
      streamStatus = streamResult.status
    } else {
      streamStatus = 'sem_canal'
    }
  }

  const resultado: ResultadoTeste = {
    lista_id: listaId,
    status,
    ping_ms: pingResult.ping_ms,
    jitter_ms: pingResult.jitter_ms,
    perda_pacotes_pct: pingResult.perda_pacotes_pct ?? null,
    http_status: downloadResult.http_status,
    ttfb_ms: downloadResult.ttfb_ms,
    velocidade_kbps: downloadResult.velocidade_kbps,
    tamanho_lista_kb: downloadResult.tamanho_lista_kb,
    tempo_download_ms: downloadResult.tempo_download_ms,
    erro_mensagem: downloadResult.erro_mensagem,
    stream_canal_nome: streamCanalNome,
    stream_ttfb_ms: streamTtfb,
    stream_throughput_kbps: streamThroughput,
    stream_consistencia_pct: streamConsistencia,
    stream_duracao_s: streamDuracao,
    stream_status: streamStatus,
  }

  await pool.query(
    `INSERT INTO m3u_testes
      (lista_id, status, ping_ms, jitter_ms, perda_pacotes_pct,
       http_status, ttfb_ms, velocidade_kbps, tamanho_lista_kb,
       tempo_download_ms, erro_mensagem,
       stream_canal_nome, stream_ttfb_ms, stream_throughput_kbps,
       stream_consistencia_pct, stream_duracao_s, stream_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      resultado.lista_id, resultado.status, resultado.ping_ms,
      resultado.jitter_ms, resultado.perda_pacotes_pct, resultado.http_status,
      resultado.ttfb_ms, resultado.velocidade_kbps, resultado.tamanho_lista_kb,
      resultado.tempo_download_ms, resultado.erro_mensagem,
      resultado.stream_canal_nome, resultado.stream_ttfb_ms,
      resultado.stream_throughput_kbps, resultado.stream_consistencia_pct,
      resultado.stream_duracao_s, resultado.stream_status,
    ]
  )

  await pool.query('UPDATE m3u_listas SET ultimo_teste_em = NOW() WHERE id = $1', [listaId])

  if (downloadResult.conteudo) {
    const credsExternas: XtreamCredentials | undefined =
      lista.tipo === 'xtream' && lista.host && lista.usuario && lista.senha
        ? { host: lista.host, username: lista.usuario, password: lista.senha }
        : undefined

    await salvarSnapshotEConteudo(listaId, lista.url_m3u, downloadResult.conteudo, lista.indexar_conteudo, credsExternas)
      .catch(err => console.error(`[m3u-tester] Erro ao salvar snapshot lista ${listaId}:`, err))
  }

  return resultado
}