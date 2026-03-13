// src/lib/m3u-tester.ts
import { pool } from '@/lib/db'
import crypto from 'crypto'

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
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; IPTV-Monitor/1.0)' },
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

// Muitos servidores IPTV usam duracao=-1 em tudo (inclusive VOD),
// entao duracao nao pode ser criterio exclusivo.
//
// Hierarquia:
//   1. Prefixo explicito no grupo  -> define tipo direto
//   2. Grupo reconhecido como VOD  -> serie ou filme
//   3. Grupo ambiguo: duracao=-1   -> canal, duracao>0 -> serie

function classificarTipo(duracao: number, _tvgId: string, grupo: string): 'canal' | 'filme' | 'serie' {
  const g = grupo.toLowerCase()

  // 1. Prefixos explicitos
  if (g.startsWith('canais |') || g.startsWith('canais|')) return 'canal'
  if (g.startsWith('filmes |') || g.startsWith('filmes/') || g.startsWith('filmes|')) return 'filme'
  if (g.startsWith('series |') || g.startsWith('series|')) return 'serie'
  if (g.startsWith('series |') || g.startsWith('series|')) return 'serie'

  // 2a. Plataformas de streaming -> serie
  const plataformas = [
    'netflix', 'globoplay', 'amazon prime', 'hbo max', 'hbomax',
    'disney+', 'star+', 'star plus', 'paramount+', 'apple tv', 'appletv+',
    'crunchyroll', 'funimation', 'lionsgate', 'oldflix', 'pluto',
    'looke', 'peacock', 'discovery+', 'max',
  ]
  if (plataformas.some(p => g.includes(p))) return 'serie'

  // 2b. Termos de serie/novela/conteudo gravado -> serie
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

  // 2c. Generos de filme -> filme
  const termsFilme = [
    'terror', 'suspense', 'romance', 'faroeste', 'guerra',
    'fantasia', 'aventura', 'documentar', 'animacao',
    'lancamento', 'nacional', 'cinema',
    'drama', 'comedia', 'acao', 'thriller', 'ficcao',
  ]
  if (termsFilme.some(t => g.includes(t))) return 'filme'

  // 3. Grupo ambiguo: duracao como tiebreaker
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
    const duracao      = duracaoMatch ? parseInt(duracaoMatch[1]) : -1
    const tvgId        = linha.match(/tvg-id="([^"]*)"/)?.[1]?.trim()     ?? ''
    const tvgName      = linha.match(/tvg-name="([^"]*)"/)?.[1]?.trim()   ?? ''
    const grupo        = linha.match(/group-title="([^"]*)"/)?.[1]?.trim() ?? 'Sem grupo'
    const logo         = linha.match(/tvg-logo="([^"]*)"/)?.[1]?.trim()   ?? ''
    const nomeRaw      = tvgName || (linha.split(',').pop()?.trim() ?? '')

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
    await fetch(url, { method: 'HEAD', signal: controller.signal, cache: 'no-store' })
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

async function medirDownload(urlM3u: string, userAgent?: string) {
  const TIMEOUT_TTFB = 15_000
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
      headers: { 'User-Agent': userAgent ?? 'Mozilla/5.0 (compatible; IPTV-Monitor/1.0)' },
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

// ─── Snapshot + catalogo ──────────────────────────────────────────────────────

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

  const { rows: conteudoExiste } = await pool.query(
    'SELECT 1 FROM m3u_conteudo WHERE lista_id = $1 LIMIT 1',
    [listaId]
  )
  const conteudoVazio = conteudoExiste.length === 0

  // Tenta buscar counts exatos via API Xtream (mais preciso que parsear M3U)
  // Prioridade: creds externas (tipo xtream com host/usuario/senha) > extrair da URL
  const creds = credsExternas ?? extrairCredenciaisXtream(urlM3u)
  const countsXtream = creds ? await buscarCountsXtream(creds) : null

  // Parseia M3U: necessario para indexacao OU para contagens quando nao ha API Xtream
  const precisaParsear = (indexarConteudo && (hashMudou || conteudoVazio)) || !countsXtream
  const entradas = precisaParsear ? parsearEntradas(conteudo) : []

  // Usa counts da API Xtream se disponivel, senao usa contagens do M3U parseado
  const contagens = countsXtream ?? gerarContagens(entradas)

  let diffAnterior = null
  if (ultimos.length > 0) {
    const prev = ultimos[0]
    diffAnterior = {
      canais: contagens.total_canais - (prev.total_canais || 0),
      filmes: contagens.total_filmes - (prev.total_filmes || 0),
      series: contagens.total_series - (prev.total_series || 0),
      total:  contagens.total_geral  - (prev.total_geral  || 0),
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

  if (indexarConteudo && (hashMudou || conteudoVazio)) {
    await pool.query('UPDATE m3u_conteudo SET ativo = false WHERE lista_id = $1', [listaId])

    const LOTE = 500
    for (let i = 0; i < entradas.length; i += LOTE) {
      const lote = entradas.slice(i, i + LOTE)
      const valores: unknown[] = []
      const placeholders = lote.map((e, idx) => {
        const base = idx * 9
        valores.push(
          listaId, snapshotId, e.tipo, e.nome, e.grupo,
          e.tvg_id || null, e.logo_url || null, e.duracao, true
        )
        return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9})`
      })

      await pool.query(
        `INSERT INTO m3u_conteudo
          (lista_id, snapshot_id, tipo, nome, grupo, tvg_id, logo_url, duracao, ativo)
         VALUES ${placeholders.join(',')}
         ON CONFLICT DO NOTHING`,
        valores
      )
    }

    console.log(`[m3u-tester] Lista ${listaId}: ${entradas.length} entradas indexadas no snapshot ${snapshotId}`)
  }
}

// ─── Funcao principal ─────────────────────────────────────────────────────────

// Teste rapido: apenas HEAD request + ping (1-2s)
// Nao baixa o M3U, nao atualiza counts/snapshot
export async function testarListaRapido(listaId: number): Promise<ResultadoTeste> {
  const { rows } = await pool.query(
    'SELECT id, url_m3u FROM m3u_listas WHERE id = $1',
    [listaId]
  )
  if (rows.length === 0) throw new Error(`Lista ${listaId} nao encontrada`)

  const lista = rows[0]
  const urlHost = extrairHost(lista.url_m3u)

  // Apenas 3 pings para ser mais rapido
  const pingResult = await medirPing(urlHost, 3, 5000)

  // GET com abort imediato apos receber status (sem baixar corpo)
  // Mais compativel que HEAD — alguns servidores retornam 404/405 para HEAD
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  let http_status: number | null = null
  let ttfb_ms: number | null = null
  let erro_mensagem: string | null = null

  try {
    const inicio = Date.now()
    const res = await fetch(lista.url_m3u, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; IPTV-Monitor/1.0)' },
    })
    ttfb_ms = Date.now() - inicio
    http_status = res.status
    // Aborta imediatamente apos receber o status — nao baixa o corpo
    controller.abort()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro desconhecido'
    // Abort intencional nao e erro
    if (!msg.includes('abort') || http_status === null) {
      erro_mensagem = ttfb_ms === null ? 'Timeout: sem resposta em 10s' : msg
    }
  } finally {
    clearTimeout(timer)
  }

  let status: ResultadoTeste['status']
  if (erro_mensagem?.includes('Timeout')) {
    status = 'timeout'
  } else if (erro_mensagem) {
    status = 'erro'
  } else if (!http_status || http_status >= 400) {
    status = 'offline'
  } else if ((pingResult.perda_pacotes_pct ?? 0) >= 80) {
    status = 'offline'
  } else {
    status = 'online'
  }

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

// Teste completo: ping + download M3U + API Xtream para counts
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

  let status: ResultadoTeste['status']
  if (downloadResult.erro_mensagem?.includes('Timeout')) {
    status = 'timeout'
  } else if (downloadResult.erro_mensagem) {
    status = 'erro'
  } else if (!downloadResult.http_status || downloadResult.http_status >= 400) {
    status = 'offline'
  } else if ((pingResult.perda_pacotes_pct ?? 0) >= 80) {
    status = 'offline'
  } else {
    status = 'online'
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
      resultado.ttfb_ms, resultado.velocidade_kbps, resultado.tamanho_lista_kb,
      resultado.tempo_download_ms, resultado.erro_mensagem,
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