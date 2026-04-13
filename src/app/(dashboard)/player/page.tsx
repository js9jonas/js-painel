// src/app/(dashboard)/player/page.tsx
'use client'

import { Suspense, useRef, useEffect, useState, useCallback, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Canal {
  nome: string
  grupo: string
  url: string
  logo?: string
}

interface StreamMetrics {
  ttfp_ms: number | null
  buffering_count: number
  buffering_total_ms: number
  bitrate_kbps: number | null
  state: 'idle' | 'loading' | 'playing' | 'buffering' | 'error'
  error_message: string | null
}

const METRICS_INICIAL: StreamMetrics = {
  ttfp_ms: null,
  buffering_count: 0,
  buffering_total_ms: 0,
  bitrate_kbps: null,
  state: 'idle',
  error_message: null,
}

// ─── Detecção de tipo de URL ──────────────────────────────────────────────────

type TipoUrl = 'm3u-playlist' | 'xtream-api' | 'direct-stream'

function detectarTipoUrl(url: string): TipoUrl {
  const u = url.toLowerCase()
  if (u.includes('get.php') && (u.includes('type=m3u') || u.includes('type=m3u_plus'))) {
    return 'm3u-playlist'
  }
  if (u.includes('/player_api.php')) {
    return 'xtream-api'
  }
  return 'direct-stream'
}

function isHLS(url: string): boolean {
  const u = url.toLowerCase()
  return u.includes('.m3u8') || u.includes('/hls/')
}

function proxyUrl(url: string): string {
  return `/api/stream-proxy?url=${encodeURIComponent(url)}`
}

function isExternal(url: string): boolean {
  if (url.startsWith('/')) return false // caminho relativo — nunca externo
  try {
    const host = new URL(url).hostname
    return host !== 'localhost' && host !== '127.0.0.1' && host !== '::1'
  } catch { return false }
}

// Custom loader para HLS.js: intercepta qualquer URL externa e redireciona pelo proxy.
// xhrSetup NÃO funciona para mudar URL (HLS.js usa context.url em openAndSendXhr).
// Único jeito correto é sobrescrever o loader e mudar context.url antes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function criarProxyLoader(BaseLoader: any) {
  return class ProxyLoader extends BaseLoader {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    load(context: any, config: any, callbacks: any) {
      // Guard: não double-proxiar URLs que já passam pelo proxy
      if (isExternal(context.url) && !context.url.includes('/api/stream-proxy')) {
        context.url = proxyUrl(context.url)
      }
      super.load(context, config, callbacks)
    }
  }
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

function parsearM3U(conteudo: string): Canal[] {
  const canais: Canal[] = []
  const linhas = conteudo.split('\n')

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i].trim()
    if (!linha.startsWith('#EXTINF')) continue

    const nome =
      linha.match(/tvg-name="([^"]*)"/)?.[1]?.trim() ||
      linha.split(',').pop()?.trim() ||
      'Sem nome'
    const grupo = linha.match(/group-title="([^"]*)"/)?.[1]?.trim() || 'Sem grupo'
    const logo = linha.match(/tvg-logo="([^"]*)"/)?.[1]?.trim()

    const urlLinha = linhas[i + 1]?.trim()
    if (urlLinha && !urlLinha.startsWith('#') && urlLinha.startsWith('http')) {
      canais.push({ nome, grupo, url: urlLinha, logo: logo || undefined })
      i++
    }
  }

  return canais
}

async function buscarCanaisXtream(apiUrl: string): Promise<Canal[]> {
  let host: string
  let username: string
  let password: string

  try {
    const u = new URL(apiUrl)
    username = u.searchParams.get('username') ?? ''
    password = u.searchParams.get('password') ?? ''
    host = `${u.protocol}//${u.host}`
  } catch {
    return []
  }

  if (!username || !password) return []

  const endpoint = `${host}/player_api.php?username=${username}&password=${password}&action=get_live_streams`

  const res = await fetch(proxyUrl(endpoint), { cache: 'no-store' })
  if (!res.ok) return []

  try {
    const data = await res.json() as Array<{
      name: string
      stream_id: number
      category_name?: string
      stream_icon?: string
    }>

    return data.map(ch => ({
      nome: ch.name ?? `Stream ${ch.stream_id}`,
      grupo: ch.category_name ?? 'Sem categoria',
      url: `${host}/live/${username}/${password}/${ch.stream_id}/index.m3u8`,
      logo: ch.stream_icon || undefined,
    }))
  } catch {
    return []
  }
}

// ─── Labels ───────────────────────────────────────────────────────────────────

const STATE_LABEL: Record<StreamMetrics['state'], string> = {
  idle: 'Aguardando',
  loading: 'Carregando',
  playing: 'Reproduzindo',
  buffering: 'Bufferizando',
  error: 'Erro',
}

const STATE_COLOR: Record<StreamMetrics['state'], string> = {
  idle: 'text-gray-400',
  loading: 'text-blue-500',
  playing: 'text-green-500',
  buffering: 'text-yellow-500',
  error: 'text-red-500',
}

const CANAIS_POR_PAGINA = 200

// ─── Painel de Listas (BD) ────────────────────────────────────────────────────

interface ListaSimples {
  id: number
  nome: string
  tipo: string
  ativo: boolean
  ultimo_status: string | null
  total_canais: number | null
  total_filmes: number | null
  total_series: number | null
}

type Aba = 'canais' | 'filmes' | 'series'

interface Categoria {
  category_id: string
  category_name: string
}

interface ItemConteudo {
  id: number
  nome: string
  categoria: string
  logo: string
  url?: string
  rating?: string
  ano?: string
}

function PainelListas({ onPlay }: { onPlay: (url: string, nome: string) => void }) {
  const [aberto, setAberto] = useState(false)
  const [listas, setListas] = useState<ListaSimples[]>([])
  const [listaAtiva, setListaAtiva] = useState<ListaSimples | null>(null)
  const [aba, setAba] = useState<Aba>('canais')
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [categoriaAtiva, setCategoriaAtiva] = useState<Categoria | null>(null)
  const [itens, setItens] = useState<ItemConteudo[]>([])
  const [carregandoCats, setCarregandoCats] = useState(false)
  const [carregandoItens, setCarregandoItens] = useState(false)
  const [busca, setBusca] = useState('')
  const [erroCats, setErroCats] = useState<string | null>(null)
  const [erroItens, setErroItens] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/m3u-listas')
      .then(r => r.json())
      .then((data: ListaSimples[]) => setListas(Array.isArray(data) ? data.filter(l => l.ativo) : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!listaAtiva) return
    setCategorias([])
    setCategoriaAtiva(null)
    setItens([])
    setBusca('')
    setErroCats(null)
    setCarregandoCats(true)

    fetch(`/api/m3u-listas/${listaAtiva.id}/conteudo?tipo=${aba}-cats`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setCategorias(data)
        else setErroCats((data as { error?: string }).error ?? 'Erro ao carregar categorias')
      })
      .catch(() => setErroCats('Erro de conexão'))
      .finally(() => setCarregandoCats(false))
  }, [listaAtiva, aba])

  function selecionarCategoria(cat: Categoria) {
    setCategoriaAtiva(cat)
    setItens([])
    setBusca('')
    setErroItens(null)
    setCarregandoItens(true)

    fetch(`/api/m3u-listas/${listaAtiva!.id}/conteudo?tipo=${aba}&categoria_id=${cat.category_id}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setItens(data)
        else setErroItens((data as { error?: string }).error ?? 'Erro ao carregar conteúdo')
      })
      .catch(() => setErroItens('Erro de conexão'))
      .finally(() => setCarregandoItens(false))
  }

  function voltar() {
    if (categoriaAtiva) {
      setCategoriaAtiva(null)
      setItens([])
      setBusca('')
    } else {
      setListaAtiva(null)
      setCategorias([])
      setBusca('')
    }
  }

  function selecionarLista(lista: ListaSimples) {
    setListaAtiva(lista)
    setAba('canais')
    setCategorias([])
    setCategoriaAtiva(null)
    setItens([])
    setBusca('')
  }

  const catsFiltradas = useMemo(() => {
    if (!busca) return categorias
    const t = busca.toLowerCase()
    return categorias.filter(c => c.category_name.toLowerCase().includes(t))
  }, [categorias, busca])

  const itensFiltrados = useMemo(() => {
    if (!busca) return itens
    const t = busca.toLowerCase()
    return itens.filter(i => i.nome.toLowerCase().includes(t))
  }, [itens, busca])

  const ABAs: { key: Aba; label: string; total: number | null }[] = listaAtiva ? [
    { key: 'canais', label: 'Canais', total: listaAtiva.total_canais },
    { key: 'filmes', label: 'Filmes', total: listaAtiva.total_filmes },
    { key: 'series', label: 'Series', total: listaAtiva.total_series },
  ] : []

  return (
    <>
      {/* Botão tab lateral */}
      <button
        onClick={() => setAberto(v => !v)}
        title={aberto ? 'Fechar painel' : 'Abrir listas'}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-50 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-l-lg shadow-lg transition-colors"
        style={{ writingMode: 'vertical-rl', padding: '14px 7px' }}
      >
        {aberto ? 'Fechar' : 'Listas'}
      </button>

      {/* Painel */}
      <div
        className={`fixed top-0 right-0 h-full w-80 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 z-40 flex flex-col shadow-2xl transition-transform duration-200 ${aberto ? 'translate-x-0' : 'translate-x-full'}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          {listaAtiva ? (
            <button
              onClick={voltar}
              className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors min-w-0"
            >
              <span className="flex-shrink-0">←</span>
              <span className="truncate">
                {categoriaAtiva ? categoriaAtiva.category_name : listaAtiva.nome}
              </span>
            </button>
          ) : (
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Servidores</h2>
          )}
        </div>

        {/* Nível 1: lista de servidores */}
        {!listaAtiva && (
          <div className="flex-1 overflow-y-auto">
            {listas.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-gray-400">
                Nenhuma lista ativa
              </div>
            ) : (
              listas.map(lista => (
                <button
                  key={lista.id}
                  onClick={() => selecionarLista(lista)}
                  className="w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      lista.ultimo_status === 'online' ? 'bg-green-500' :
                      lista.ultimo_status ? 'bg-red-400' : 'bg-gray-300'
                    }`} />
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{lista.nome}</p>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 ml-4">
                    {[
                      lista.total_canais ? `${lista.total_canais.toLocaleString('pt-BR')} canais` : null,
                      lista.total_filmes ? `${lista.total_filmes.toLocaleString('pt-BR')} filmes` : null,
                      lista.total_series ? `${lista.total_series.toLocaleString('pt-BR')} séries` : null,
                    ].filter(Boolean).join(' · ') || lista.tipo}
                  </p>
                </button>
              ))
            )}
          </div>
        )}

        {/* Nível 2: abas + categorias */}
        {listaAtiva && !categoriaAtiva && (
          <>
            <div className="flex border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
              {ABAs.map(({ key, label, total }) => (
                <button
                  key={key}
                  onClick={() => setAba(key)}
                  className={`flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2 ${
                    aba === key
                      ? 'text-blue-600 dark:text-blue-400 border-blue-600'
                      : 'text-gray-500 dark:text-gray-400 border-transparent hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {label}
                  {total !== null && total > 0 && (
                    <span className="ml-1 text-gray-400 font-normal">
                      ({total.toLocaleString('pt-BR')})
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
              <input
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
                placeholder="Buscar categoria..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
              />
            </div>

            <div className="flex-1 overflow-y-auto">
              {carregandoCats ? (
                <div className="flex items-center justify-center h-32 gap-2 text-sm text-gray-400">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                  Carregando...
                </div>
              ) : erroCats ? (
                <div className="px-4 py-3 text-sm text-red-500">{erroCats}</div>
              ) : catsFiltradas.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-sm text-gray-400">
                  Nenhuma categoria
                </div>
              ) : (
                catsFiltradas.map(cat => (
                  <button
                    key={cat.category_id}
                    onClick={() => selecionarCategoria(cat)}
                    className="w-full text-left px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm text-gray-800 dark:text-gray-200"
                  >
                    {cat.category_name}
                  </button>
                ))
              )}
            </div>
          </>
        )}

        {/* Nível 3: itens */}
        {listaAtiva && categoriaAtiva && (
          <>
            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
              <input
                className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
                placeholder={`Buscar ${aba === 'canais' ? 'canal' : aba === 'filmes' ? 'filme' : 'série'}...`}
                value={busca}
                onChange={e => setBusca(e.target.value)}
                autoFocus
              />
            </div>

            <div className="flex-1 overflow-y-auto">
              {carregandoItens ? (
                <div className="flex items-center justify-center h-32 gap-2 text-sm text-gray-400">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                  Carregando...
                </div>
              ) : erroItens ? (
                <div className="px-4 py-3 text-sm text-red-500">{erroItens}</div>
              ) : itensFiltrados.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-sm text-gray-400">
                  {itens.length === 0 ? 'Nenhum item' : 'Nenhum resultado'}
                </div>
              ) : (
                itensFiltrados.map(item => (
                  <button
                    key={item.id}
                    onClick={() => item.url ? onPlay(item.url, item.nome) : undefined}
                    disabled={!item.url}
                    className={`w-full text-left px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0 flex items-center gap-2.5 transition-colors ${
                      item.url
                        ? 'hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer'
                        : 'opacity-50 cursor-default'
                    }`}
                  >
                    {item.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.logo}
                        alt=""
                        className="w-8 h-8 object-contain flex-shrink-0 rounded bg-gray-100 dark:bg-gray-800"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800 dark:text-gray-200 truncate leading-snug">{item.nome}</p>
                      {(item.ano || item.rating) && (
                        <p className="text-xs text-gray-400">
                          {[item.ano, item.rating ? `${item.rating}` : null].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </>
  )
}

// ─── Lista de canais ──────────────────────────────────────────────────────────

function ListaCanais({
  canais,
  titulo,
  canalAtivo,
  onSelecionar,
}: {
  canais: Canal[]
  titulo: string
  canalAtivo: Canal | null
  onSelecionar: (canal: Canal) => void
}) {
  const [busca, setBusca] = useState('')
  const [grupoFiltro, setGrupoFiltro] = useState('Todos')

  const grupos = useMemo(() => {
    const set = new Set(canais.map(c => c.grupo))
    return ['Todos', ...Array.from(set).sort()]
  }, [canais])

  const canalsFiltrados = useMemo(() => {
    const termo = busca.toLowerCase()
    return canais.filter(c => {
      const matchGrupo = grupoFiltro === 'Todos' || c.grupo === grupoFiltro
      const matchBusca = !termo || c.nome.toLowerCase().includes(termo) || c.grupo.toLowerCase().includes(termo)
      return matchGrupo && matchBusca
    }).slice(0, CANAIS_POR_PAGINA)
  }, [canais, busca, grupoFiltro])

  const total = useMemo(() => {
    const termo = busca.toLowerCase()
    return canais.filter(c => {
      const matchGrupo = grupoFiltro === 'Todos' || c.grupo === grupoFiltro
      const matchBusca = !termo || c.nome.toLowerCase().includes(termo) || c.grupo.toLowerCase().includes(termo)
      return matchGrupo && matchBusca
    }).length
  }, [canais, busca, grupoFiltro])

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden flex flex-col" style={{ height: '60vh' }}>
      {/* Header da lista */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 truncate">{titulo}</p>
          <span className="text-xs text-gray-400 ml-2 whitespace-nowrap">
            {total.toLocaleString('pt-BR')} canal{total !== 1 ? 'is' : ''}
            {total > CANAIS_POR_PAGINA ? ` (mostrando ${CANAIS_POR_PAGINA})` : ''}
          </span>
        </div>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400"
            placeholder="Buscar canal..."
            value={busca}
            onChange={e => setBusca(e.target.value)}
            autoFocus
          />
          {grupos.length > 2 && (
            <select
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-700 dark:text-gray-300"
              value={grupoFiltro}
              onChange={e => setGrupoFiltro(e.target.value)}
            >
              {grupos.map(g => (
                <option key={g} value={g}>{g === 'Todos' ? '— Todos os grupos —' : g}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {canalsFiltrados.length === 0 ? (
          <div className="flex items-center justify-center h-full text-sm text-gray-400">
            Nenhum canal encontrado
          </div>
        ) : (
          canalsFiltrados.map((canal, i) => {
            const ativo = canalAtivo?.url === canal.url
            return (
              <button
                key={i}
                onClick={() => onSelecionar(canal)}
                className={`w-full text-left px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0 flex items-center gap-3 transition-colors ${
                  ativo
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-l-blue-500'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {canal.logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={canal.logo}
                    alt=""
                    className="w-7 h-7 object-contain flex-shrink-0 rounded"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                  />
                )}
                <div className="min-w-0">
                  <p className={`text-sm truncate ${ativo ? 'font-semibold text-blue-700 dark:text-blue-300' : 'text-gray-800 dark:text-gray-200'}`}>
                    {canal.nome}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{canal.grupo}</p>
                </div>
                {ativo && <span className="ml-auto text-blue-500 text-xs flex-shrink-0">▶ ao vivo</span>}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

// ─── Player principal ─────────────────────────────────────────────────────────

function PlayerContent() {
  const searchParams = useSearchParams()
  const initialUrl = searchParams.get('url') ?? ''
  const initialName = searchParams.get('name') ?? ''

  // Estado de navegação
  const [inputUrl, setInputUrl] = useState(initialUrl)
  const [carregandoPlaylist, setCarregandoPlaylist] = useState(false)
  const [erroPlaylist, setErroPlaylist] = useState<string | null>(null)
  const [canais, setCanais] = useState<Canal[] | null>(null)
  const [tituloLista, setTituloLista] = useState('')
  const [canalAtivo, setCanalAtivo] = useState<Canal | null>(null)
  const [streamUrl, setStreamUrl] = useState<string>('')
  const [useProxy, setUseProxy] = useState(() => isExternal(initialUrl))

  // Estado do player
  const [metrics, setMetrics] = useState<StreamMetrics>(METRICS_INICIAL)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<InstanceType<typeof import('hls.js').default> | null>(null)
  const mpegtsRef = useRef<ReturnType<typeof import('mpegts.js').default.createPlayer> | null>(null)
  const startTimeRef = useRef<number>(0)
  const bufferingStartRef = useRef<number | null>(null)
  const firstFrameRef = useRef(false)

  // ── Destroy ────────────────────────────────────────────────────────────────

  function destroyPlayer() {
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null }
    if (mpegtsRef.current) { mpegtsRef.current.destroy(); mpegtsRef.current = null }
    const video = videoRef.current
    if (video) {
      video.onwaiting = null
      video.onplaying = null
      video.onerror = null
      video.src = ''
      video.load()
    }
  }

  // ── Load stream ────────────────────────────────────────────────────────────

  const loadStream = useCallback(async (url: string, viaProxy: boolean) => {
    if (!url || !videoRef.current) return

    destroyPlayer()
    firstFrameRef.current = false
    startTimeRef.current = Date.now()
    bufferingStartRef.current = null
    setMetrics({ ...METRICS_INICIAL, state: 'loading' })

    const video = videoRef.current

    video.onwaiting = () => {
      bufferingStartRef.current = Date.now()
      setMetrics(m => ({ ...m, state: 'buffering' }))
    }

    video.onplaying = () => {
      if (!firstFrameRef.current) {
        firstFrameRef.current = true
        setMetrics(m => ({ ...m, ttfp_ms: Date.now() - startTimeRef.current, state: 'playing' }))
      } else if (bufferingStartRef.current !== null) {
        const dur = Date.now() - bufferingStartRef.current
        bufferingStartRef.current = null
        setMetrics(m => ({
          ...m,
          state: 'playing',
          buffering_total_ms: m.buffering_total_ms + dur,
          buffering_count: m.buffering_count + 1,
        }))
      } else {
        setMetrics(m => ({ ...m, state: 'playing' }))
      }
    }

    const urlEfetiva = viaProxy ? proxyUrl(url) : url

    if (isHLS(url)) {
      const { default: Hls } = await import('hls.js')

      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 30,
          // Loader customizado: modifica context.url antes do XHR abrir.
          // xhrSetup não funciona para mudar URLs (context.url sobrescreve).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          loader: (viaProxy ? criarProxyLoader(Hls.DefaultConfig.loader) : Hls.DefaultConfig.loader) as any,
        })
        hlsRef.current = hls

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {})
        })

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (!data.fatal) return
          setMetrics(m => ({ ...m, state: 'error', error_message: `Erro HLS: ${data.details ?? data.type}` }))
        })

        hls.on(Hls.Events.LEVEL_UPDATED, (_, data) => {
          const level = hls.levels[data.level]
          if (level?.bitrate) setMetrics(m => ({ ...m, bitrate_kbps: Math.round(level.bitrate / 1000) }))
        })

        hls.loadSource(urlEfetiva)
        hls.attachMedia(video)
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = urlEfetiva
        video.play().catch(() => {})
      } else {
        setMetrics(m => ({ ...m, state: 'error', error_message: 'HLS não suportado. Use Chrome ou Firefox.' }))
      }
    } else {
      const mpegts = (await import('mpegts.js')).default

      if (mpegts.isSupported()) {
        const player = mpegts.createPlayer(
          { type: 'mpegts', url: urlEfetiva, isLive: true },
          { enableWorker: true }
        )
        mpegtsRef.current = player

        player.on(mpegts.Events.ERROR, (errorType: string, errorDetail: object) => {
          const msg = (errorDetail as { msg?: string })?.msg ?? String(errorDetail)
          setMetrics(m => ({ ...m, state: 'error', error_message: `Erro MPEG-TS (${errorType}): ${msg}` }))
        })

        player.attachMediaElement(video)
        player.load()
        video.play().catch(() => {})
      } else {
        setMetrics(m => ({ ...m, state: 'error', error_message: 'MPEG-TS não suportado neste navegador.' }))
      }
    }
  }, [])

  useEffect(() => {
    if (streamUrl) loadStream(streamUrl, useProxy)
    return () => destroyPlayer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamUrl, useProxy])

  // ── Selecionar canal da lista ──────────────────────────────────────────────

  function selecionarCanal(canal: Canal) {
    setCanalAtivo(canal)
    setUseProxy(isExternal(canal.url))
    setStreamUrl(canal.url)
    const sp = new URLSearchParams(window.location.search)
    sp.set('url', canal.url)
    sp.set('name', canal.nome)
    window.history.replaceState({}, '', `?${sp}`)
  }

  // ── Processar URL do input ─────────────────────────────────────────────────

  async function handleCarregar() {
    const url = inputUrl.trim()
    if (!url) return

    setErroPlaylist(null)
    const tipo = detectarTipoUrl(url)

    if (tipo === 'direct-stream') {
      setCanais(null)
      setCanalAtivo(null)
      setTituloLista('')
      setUseProxy(isExternal(url))
      setStreamUrl(url)
      const sp = new URLSearchParams(window.location.search)
      sp.set('url', url)
      window.history.replaceState({}, '', `?${sp}`)
      return
    }

    // Buscar e parsear playlist
    setCarregandoPlaylist(true)
    setCanais(null)
    destroyPlayer()
    setMetrics(METRICS_INICIAL)

    try {
      let novosCanais: Canal[] = []

      if (tipo === 'm3u-playlist') {
        const res = await fetch(proxyUrl(url), { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar a lista`)
        const texto = await res.text()
        if (!texto.includes('#EXTM3U') && !texto.includes('#EXTINF')) {
          throw new Error('Arquivo não parece ser uma lista M3U válida')
        }
        novosCanais = parsearM3U(texto)
        setTituloLista(`Lista M3U · ${novosCanais.length.toLocaleString('pt-BR')} canais`)
      } else {
        // xtream-api
        novosCanais = await buscarCanaisXtream(url)
        setTituloLista(`Xtream Codes · ${novosCanais.length.toLocaleString('pt-BR')} canais ao vivo`)
      }

      if (novosCanais.length === 0) {
        throw new Error('Nenhum canal encontrado na lista')
      }

      setCanais(novosCanais)
    } catch (e) {
      setErroPlaylist(e instanceof Error ? e.message : 'Erro ao carregar a lista')
    } finally {
      setCarregandoPlaylist(false)
    }
  }

  // ── Copiar métricas ────────────────────────────────────────────────────────

  function copiarMetricas() {
    const tipo = streamUrl ? (isHLS(streamUrl) ? 'HLS' : 'MPEG-TS') : '—'
    const texto = [
      `Canal: ${canalAtivo?.nome ?? initialName ?? '—'}`,
      `URL: ${streamUrl}`,
      `Tipo: ${tipo}`,
      `Estado: ${STATE_LABEL[metrics.state]}`,
      `TTFP: ${metrics.ttfp_ms !== null ? `${metrics.ttfp_ms}ms` : 'N/A'}`,
      `Buffering: ${metrics.buffering_count}x (total ${metrics.buffering_total_ms}ms)`,
      `Bitrate: ${metrics.bitrate_kbps !== null ? `${metrics.bitrate_kbps} kbps` : 'N/A'}`,
      metrics.error_message ? `Erro: ${metrics.error_message}` : null,
    ].filter(Boolean).join('\n')
    navigator.clipboard.writeText(texto).catch(() => {})
  }

  // ── Play a partir do painel de listas ─────────────────────────────────────

  function handlePlayFromPanel(url: string, nome: string) {
    setCanais(null)
    setCanalAtivo(null)
    setTituloLista('')
    setErroPlaylist(null)
    setInputUrl(url)
    setUseProxy(isExternal(url))
    setStreamUrl(url)
    const sp = new URLSearchParams(window.location.search)
    sp.set('url', url)
    sp.set('name', nome)
    window.history.replaceState({}, '', `?${sp}`)
  }

  // ── Inicialização: se veio com URL de stream direto na query ───────────────

  useEffect(() => {
    if (initialUrl && detectarTipoUrl(initialUrl) === 'direct-stream') {
      setStreamUrl(initialUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────

  const nomeExibido = canalAtivo?.nome ?? initialName ?? ''
  const tipo = streamUrl ? (isHLS(streamUrl) ? 'HLS (.m3u8)' : 'MPEG-TS') : '—'
  const buf = metrics.buffering_total_ms
  const modoPlaylist = canais !== null

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          Player de Stream
          {nomeExibido && (
            <span className="ml-2 text-gray-500 dark:text-gray-400 text-lg font-normal">· {nomeExibido}</span>
          )}
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Cole uma URL de stream, playlist M3U ou servidor Xtream Codes
        </p>
      </div>

      {/* URL Input */}
      <div className="flex gap-2 mb-3">
        <input
          className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400 font-mono"
          placeholder="http://... — stream .m3u8/.ts, lista /get.php?type=m3u_plus, ou /player_api.php"
          value={inputUrl}
          onChange={e => setInputUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCarregar()}
        />
        <button
          onClick={handleCarregar}
          disabled={carregandoPlaylist}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors whitespace-nowrap"
        >
          {carregandoPlaylist ? (
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Carregando...
            </span>
          ) : modoPlaylist ? 'Recarregar' : 'Carregar'}
        </button>
      </div>

      {/* Indicadores de tipo + toggle proxy */}
      {(() => {
        const url = inputUrl.trim()
        const tipoDetectado = url ? detectarTipoUrl(url) : null
        const ehHLSDireto = tipoDetectado === 'direct-stream' && isHLS(url)
        const ehPlaylist = tipoDetectado === 'm3u-playlist' || tipoDetectado === 'xtream-api'
        const proxyApplicavel = ehHLSDireto || ehPlaylist || modoPlaylist

        const infoProxy = ehHLSDireto
          ? 'Útil quando o servidor bloqueia requisições do navegador (CORS). O hls.js tenta direto primeiro e cai no proxy automaticamente se necessário.'
          : (ehPlaylist || modoPlaylist)
            ? 'Os canais Xtream usam HLS — cada segmento é um arquivo curto que o proxy consegue repassar. Ativado automaticamente pelo hls.js se detectar erro de CORS.'
            : null

        return (
          <div className="mb-4 space-y-1.5">
            <div className="flex items-center gap-3">
              {tipoDetectado && (
                <span className={`text-xs ${
                  tipoDetectado === 'm3u-playlist' ? 'text-purple-600 dark:text-purple-400' :
                  tipoDetectado === 'xtream-api'   ? 'text-blue-600 dark:text-blue-400' :
                                                     'text-green-600 dark:text-green-400'
                }`}>
                  {tipoDetectado === 'm3u-playlist' ? '📋 Playlist M3U — vai mostrar lista de canais' :
                   tipoDetectado === 'xtream-api'   ? '📡 Xtream Codes — vai buscar canais ao vivo' :
                                                      '▶ Stream direto — vai reproduzir imediatamente'}
                </span>
              )}

              {proxyApplicavel && (
                <label className="flex items-center gap-1.5 cursor-pointer select-none ml-auto">
                  <input
                    type="checkbox"
                    checked={useProxy}
                    onChange={e => setUseProxy(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600"
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400">Proxy CORS</span>
                </label>
              )}
            </div>

            {proxyApplicavel && infoProxy && (
              <p className="text-xs text-gray-400 dark:text-gray-500 border-l-2 border-gray-200 dark:border-gray-700 pl-2">
                {infoProxy}
              </p>
            )}
          </div>
        )
      })()}

      {/* Erro de playlist */}
      {erroPlaylist && (
        <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-400 flex items-center justify-between">
          <span>{erroPlaylist}</span>
          <button onClick={() => setErroPlaylist(null)} className="ml-4 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Layout: lista + player lado a lado quando playlist carregada */}
      {modoPlaylist ? (
        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">
          {/* Lista de canais */}
          <ListaCanais
            canais={canais!}
            titulo={tituloLista}
            canalAtivo={canalAtivo}
            onSelecionar={selecionarCanal}
          />

          {/* Player + métricas */}
          <div className="space-y-4">
            {canalAtivo ? (
              <>
                <div className="bg-black rounded-xl overflow-hidden shadow-lg">
                  <div className="relative aspect-video">
                    <video ref={videoRef} className="w-full h-full" controls playsInline />
                    {metrics.state === 'loading' && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
                        <div className="flex flex-col items-center gap-2">
                          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span className="text-white text-xs">Carregando stream...</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <MetricasPanel metrics={metrics} streamUrl={streamUrl} canalNome={canalAtivo.nome} tipo={tipo} buf={buf} onCopiar={copiarMetricas} />
              </>
            ) : (
              <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 aspect-video text-gray-400 text-sm">
                Selecione um canal na lista para reproduzir
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Layout: stream direto */
        <div className="space-y-4">
          <div className="bg-black rounded-xl overflow-hidden shadow-lg">
            <div className="relative aspect-video">
              <video ref={videoRef} className="w-full h-full" controls playsInline />
              {metrics.state === 'loading' && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span className="text-white text-xs">Carregando stream...</span>
                  </div>
                </div>
              )}
              {metrics.state === 'idle' && !streamUrl && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
                  Cole uma URL acima e clique em Carregar
                </div>
              )}
            </div>
          </div>
          <MetricasPanel metrics={metrics} streamUrl={streamUrl} canalNome={nomeExibido} tipo={tipo} buf={buf} onCopiar={copiarMetricas} />
        </div>
      )}
      <PainelListas onPlay={handlePlayFromPanel} />
    </div>
  )
}

// ─── Painel de métricas (extraído para reutilização) ──────────────────────────

function MetricasPanel({
  metrics,
  streamUrl,
  canalNome,
  tipo,
  buf,
  onCopiar,
}: {
  metrics: StreamMetrics
  streamUrl: string
  canalNome: string
  tipo: string
  buf: number
  onCopiar: () => void
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-800">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Métricas</h2>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${STATE_COLOR[metrics.state]}`}>
            ● {STATE_LABEL[metrics.state]}
          </span>
          <button
            onClick={onCopiar}
            className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 dark:border-gray-700 px-2 py-0.5 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Copiar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y divide-gray-100 dark:divide-gray-800">
        <div className="px-4 py-3">
          <p className="text-xs text-gray-400">TTFP</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-0.5">
            {metrics.ttfp_ms !== null ? `${metrics.ttfp_ms}ms` : '—'}
          </p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-gray-400">Buffering</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-0.5">
            {metrics.buffering_count > 0 ? `${metrics.buffering_count}x` : metrics.state === 'playing' ? '0x' : '—'}
          </p>
          {metrics.buffering_count > 0 && (
            <p className="text-xs text-gray-400">{buf >= 60000 ? `${Math.round(buf / 1000)}s` : `${buf}ms`} total</p>
          )}
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-gray-400">Bitrate</p>
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-0.5">
            {metrics.bitrate_kbps !== null
              ? metrics.bitrate_kbps >= 1000
                ? `${(metrics.bitrate_kbps / 1000).toFixed(1)} Mbps`
                : `${metrics.bitrate_kbps} kbps`
              : '—'}
          </p>
          {metrics.bitrate_kbps === null && metrics.state === 'playing' && (
            <p className="text-xs text-gray-400">Somente HLS</p>
          )}
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-gray-400">Protocolo</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-0.5">{tipo}</p>
        </div>
      </div>

      {metrics.error_message && (
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-red-50 dark:bg-red-900/20">
          <p className="text-sm text-red-600 dark:text-red-400 font-medium">{metrics.error_message}</p>
          <p className="text-xs text-red-500/70 mt-1">
            Se for erro de CORS, ative &ldquo;Proxy CORS&rdquo; acima e recarregue.
          </p>
        </div>
      )}

      {streamUrl && (
        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
          <p className="text-xs text-gray-400 font-mono truncate" title={streamUrl}>
            {canalNome ? <span className="text-gray-600 dark:text-gray-300 not-italic font-sans">{canalNome} · </span> : null}
            {streamUrl}
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Página (com Suspense para useSearchParams) ────────────────────────────────

export default function PlayerPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 flex items-center gap-2 text-gray-400 text-sm">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          Carregando player...
        </div>
      }
    >
      <PlayerContent />
    </Suspense>
  )
}
