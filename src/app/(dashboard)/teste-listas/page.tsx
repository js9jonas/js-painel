// src/app/(dashboard)/teste-listas/page.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  BarChart, Bar, LineChart, Line, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface HistoricoMedias {
  id: number
  nome: string
  ping_medio: number | null
  ttfb_medio: number | null
  jitter_medio: number | null
  velocidade_media: number | null
  uptime_pct: number | null
  total_testes: number
}

interface HistoricoContagem {
  nome: string
  total_canais: number | null
  total_filmes: number | null
  total_series: number | null
  total_geral: number | null
}

interface Historico {
  medias: HistoricoMedias[]
  serie: Record<string, number>[]
  servidores: string[]
  periodo_horas: number
  contagens: HistoricoContagem[]
}

const CORES_SERVIDOR = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
]

type StatusLista = 'online' | 'offline' | 'timeout' | 'erro' | null

interface Lista {
  id: number
  nome: string
  url_m3u: string
  tipo: 'url' | 'xtream'
  host: string | null
  usuario: string | null
  porta: number | null
  ativo: boolean
  indexar_conteudo: boolean
  intervalo_teste_min: number
  criado_em: string
  ultimo_teste_em: string | null
  ultimo_status: StatusLista
  ping_ms: number | null
  jitter_ms: number | null
  perda_pacotes_pct: number | null
  ttfb_ms: number | null
  velocidade_kbps: number | null
  tempo_download_ms: number | null
  tamanho_lista_kb: number | null
  http_status: number | null
  erro_mensagem: string | null
  total_canais: number | null
  total_filmes: number | null
  total_series: number | null
  total_geral: number | null
  snapshot_em: string | null
  uptime_24h: number | null
  stream_teste_id: string | null
}

interface FormData {
  nome: string
  tipo: 'url' | 'xtream'
  url_m3u: string
  host: string
  usuario: string
  senha: string
  porta: string
  intervalo_teste_min: string
  indexar_conteudo: boolean
  ativo: boolean
}

const FORM_INICIAL: FormData = {
  nome: '',
  tipo: 'url',
  url_m3u: '',
  host: '',
  usuario: '',
  senha: '',
  porta: '',
  intervalo_teste_min: '15',
  indexar_conteudo: false,
  ativo: true,
}

const PERIODOS = [
  { horas: 6,   label: '6h' },
  { horas: 24,  label: '24h' },
  { horas: 48,  label: '2d' },
  { horas: 168, label: '7d' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusConfig(status: StatusLista) {
  switch (status) {
    case 'online':
      return {
        cor: 'border-green-500',
        bg: 'bg-green-500',
        label: 'Online',
        labelCor: 'text-green-600 dark:text-green-400',
        badgeCor: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      }
    case 'offline':
    case 'timeout':
    case 'erro':
      return {
        cor: 'border-red-500',
        bg: 'bg-red-500',
        label: status === 'timeout' ? 'Timeout' : status === 'erro' ? 'Erro' : 'Offline',
        labelCor: 'text-red-600 dark:text-red-400',
        badgeCor: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      }
    default:
      return {
        cor: 'border-gray-300 dark:border-gray-600',
        bg: 'bg-gray-400',
        label: 'Sem dados',
        labelCor: 'text-gray-400',
        badgeCor: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
      }
  }
}

// Calcula score a partir de médias históricas ou fallback para último teste
function scoreQualidade(lista: Lista, mediasHistorico: HistoricoMedias | null): number | null {
  const ping   = mediasHistorico?.ping_medio   ?? lista.ping_ms   ?? null
  const jitter = mediasHistorico?.jitter_medio ?? lista.jitter_ms ?? null
  const uptime = mediasHistorico?.uptime_pct   ?? lista.uptime_24h ?? null

  if (ping === null && uptime === null) return null

  const scorePing   = Math.max(0, 100 - (ping   ?? 999) / 10)
  const scoreJitter = Math.max(0, 100 - (jitter ?? 0)   / 5)
  const scoreUptime = uptime ?? 0
  return Math.round((scorePing * 0.35 + scoreUptime * 0.45 + scoreJitter * 0.20)) / 10
}

function corScore(score: number | null) {
  if (score === null) return 'text-gray-400'
  if (score >= 8) return 'text-green-600 dark:text-green-400'
  if (score >= 6) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

function formatNum(n: number | null, sufixo = '') {
  if (n == null) return '—'
  return `${n.toLocaleString('pt-BR')}${sufixo}`
}

function tempoAtras(iso: string | null, agora: number) {
  if (!iso) return '—'
  const diff = Math.floor((agora - new Date(iso).getTime()) / 1000)
  if (diff < 60) return `${diff}s atrás`
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`
  return `${Math.floor(diff / 86400)}d atrás`
}

// ─── Radar de qualidade ───────────────────────────────────────────────────────

function RadarQualidade({ medias }: { medias: HistoricoMedias[] }) {
  const maxPing   = Math.max(...medias.map(m => m.ping_medio   ?? 0), 1)
  const maxJitter = Math.max(...medias.map(m => m.jitter_medio ?? 0), 1)
  const maxTtfb   = Math.max(...medias.map(m => m.ttfb_medio   ?? 0), 1)
  const maxVel    = Math.max(...medias.map(m => m.velocidade_media ?? 0), 1)

  const dadosRadar = medias.map((m, i) => ({
    nome: m.nome,
    cor: CORES_SERVIDOR[i % CORES_SERVIDOR.length],
    data: [
      { eixo: 'Uptime',     valor: m.uptime_pct ?? 0 },
      { eixo: 'Ping',       valor: Math.max(0, 100 - ((m.ping_medio   ?? maxPing)   / maxPing)   * 100) },
      { eixo: 'Jitter',     valor: Math.max(0, 100 - ((m.jitter_medio ?? maxJitter) / maxJitter) * 100) },
      { eixo: 'TTFB',       valor: Math.max(0, 100 - ((m.ttfb_medio   ?? maxTtfb)   / maxTtfb)   * 100) },
      { eixo: 'Velocidade', valor: maxVel > 0 ? ((m.velocidade_media ?? 0) / maxVel) * 100 : 0 },
    ],
  }))

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {dadosRadar.map(servidor => (
        <div key={servidor.nome} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3">
          <p className="text-xs font-semibold text-center mb-1 truncate" style={{ color: servidor.cor }}>
            {servidor.nome}
          </p>
          <ResponsiveContainer width="100%" height={160}>
            <RadarChart data={servidor.data} margin={{ top: 0, right: 16, bottom: 0, left: 16 }}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis dataKey="eixo" tick={{ fontSize: 9, fill: '#9ca3af' }} />
              <Radar dataKey="valor" stroke={servidor.cor} fill={servidor.cor} fillOpacity={0.25} strokeWidth={1.5} />
            </RadarChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 mt-1">
            {servidor.data.map(d => (
              <div key={d.eixo} className="flex justify-between text-[10px]">
                <span className="text-gray-400">{d.eixo}</span>
                <span className="font-medium text-gray-600 dark:text-gray-300">{Math.round(d.valor)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Gráfico latências ────────────────────────────────────────────────────────

function GraficoLatencias({ medias }: { medias: HistoricoMedias[] }) {
  const data = medias.map(m => ({
    nome:   m.nome,
    Ping:   m.ping_medio   ?? 0,
    Jitter: m.jitter_medio ?? 0,
    TTFB:   m.ttfb_medio   ?? 0,
  }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="nome" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} unit="ms" />
        <Tooltip formatter={(v, name) => [`${v}ms`, name]} contentStyle={{ fontSize: 12 }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="Ping"   fill="#3b82f6" radius={[3, 3, 0, 0]} />
        <Bar dataKey="Jitter" fill="#f59e0b" radius={[3, 3, 0, 0]} />
        <Bar dataKey="TTFB"   fill="#8b5cf6" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Gráfico velocidade ───────────────────────────────────────────────────────

function GraficoVelocidade({ medias }: { medias: HistoricoMedias[] }) {
  const data = medias
    .filter(m => m.velocidade_media !== null && m.velocidade_media > 0)
    .map(m => ({
      nome: m.nome,
      velocidade: Math.round((m.velocidade_media ?? 0) / 1000 * 10) / 10,
    }))

  if (data.length === 0) return (
    <div className="flex items-center justify-center h-32 text-xs text-gray-400">
      Dados disponíveis após teste completo
    </div>
  )

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="nome" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} unit=" Mb/s" />
        <Tooltip formatter={(v) => [`${v} Mb/s`, 'Velocidade']} contentStyle={{ fontSize: 12 }} />
        <Bar dataKey="velocidade" name="Velocidade" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.velocidade >= 5 ? '#10b981' : entry.velocidade >= 2 ? '#f59e0b' : '#ef4444'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Gráfico uptime temporal ──────────────────────────────────────────────────

function GraficoUptimeTempo({ serie, servidores }: { serie: Record<string, number>[]; servidores: string[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={serie} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="hora" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
        <Tooltip formatter={(v, name) => [`${v}%`, name]} contentStyle={{ fontSize: 12 }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        {servidores.map((nome, i) => (
          <Line key={nome} type="monotone" dataKey={`${nome}_uptime`} name={nome}
            stroke={CORES_SERVIDOR[i % CORES_SERVIDOR.length]} dot={false} strokeWidth={2} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

// ─── Gráfico ping temporal ────────────────────────────────────────────────────

function GraficoPingTempo({ serie, servidores }: { serie: Record<string, number>[]; servidores: string[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={serie} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="hora" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11 }} unit="ms" />
        <Tooltip formatter={(v, name) => [`${v}ms`, name]} contentStyle={{ fontSize: 12 }} />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        {servidores.map((nome, i) => (
          <Line key={nome} type="monotone" dataKey={`${nome}_ping`} name={nome}
            stroke={CORES_SERVIDOR[i % CORES_SERVIDOR.length]} dot={false} strokeWidth={2} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

// ─── Tabela comparativa ───────────────────────────────────────────────────────

function TabelaComparativa({ medias, servidores }: { medias: HistoricoMedias[]; servidores: string[] }) {
  const sorted = [...medias].sort((a, b) => (b.uptime_pct ?? 0) - (a.uptime_pct ?? 0))

  function barinha(valor: number, max: number, cor: string) {
    const pct = Math.min(100, (valor / max) * 100)
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: cor }} />
        </div>
        <span className="text-xs text-gray-600 dark:text-gray-400 w-14 text-right tabular-nums">
          {valor > 0 ? `${valor}ms` : '—'}
        </span>
      </div>
    )
  }

  const maxPing   = Math.max(...medias.map(m => m.ping_medio   ?? 0), 1)
  const maxJitter = Math.max(...medias.map(m => m.jitter_medio ?? 0), 1)
  const maxTtfb   = Math.max(...medias.map(m => m.ttfb_medio   ?? 0), 1)

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 dark:border-gray-800">
            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 w-32">Servidor</th>
            <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">Ping médio</th>
            <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">Jitter médio</th>
            <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400">TTFB médio</th>
            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 w-24">Uptime</th>
            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 w-16">Score</th>
            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 w-16">Testes</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m, i) => {
            const cor    = CORES_SERVIDOR[servidores.indexOf(m.nome) % CORES_SERVIDOR.length]
            const uptime = m.uptime_pct ?? 0
            const scorePing   = Math.max(0, 100 - (m.ping_medio   ?? 999) / 10)
            const scoreJitter = Math.max(0, 100 - (m.jitter_medio ?? 0)   / 5)
            const score = Math.round((scorePing * 0.35 + uptime * 0.45 + scoreJitter * 0.20)) / 10

            return (
              <tr key={m.id} className={i % 2 === 0 ? 'bg-gray-50 dark:bg-gray-800/50' : ''}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cor }} />
                    <span className="font-medium text-gray-800 dark:text-gray-200 text-xs truncate max-w-[90px]">{m.nome}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5">{barinha(m.ping_medio   ?? 0, maxPing,   '#3b82f6')}</td>
                <td className="px-4 py-2.5">{barinha(m.jitter_medio ?? 0, maxJitter, '#f59e0b')}</td>
                <td className="px-4 py-2.5">{barinha(m.ttfb_medio   ?? 0, maxTtfb,   '#8b5cf6')}</td>
                <td className="px-4 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <div className="w-12 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{
                        width: `${uptime}%`,
                        backgroundColor: uptime >= 90 ? '#10b981' : uptime >= 70 ? '#f59e0b' : '#ef4444',
                      }} />
                    </div>
                    <span className={`text-xs font-semibold tabular-nums ${
                      uptime >= 90 ? 'text-green-600 dark:text-green-400'
                      : uptime >= 70 ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-red-600 dark:text-red-400'
                    }`}>{uptime}%</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span className={`text-sm font-bold ${
                    score >= 8 ? 'text-green-600 dark:text-green-400'
                    : score >= 6 ? 'text-yellow-600 dark:text-yellow-400'
                    : 'text-red-600 dark:text-red-400'
                  }`}>{score}</span>
                </td>
                <td className="px-4 py-2.5 text-right text-gray-400 text-xs tabular-nums">{m.total_testes}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Modal Canal de Teste ─────────────────────────────────────────────────────

function ModalCanalTeste({ lista, onFechar, onSalvar }: {
  lista: Lista
  onFechar: () => void
  onSalvar: (streamId: string, nome: string) => Promise<void>
}) {
  const [busca, setBusca] = useState('')
  const [canais, setCanais] = useState<{ stream_id: number; nome: string; categoria: string }[]>([])
  const [buscando, setBuscando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const buscarCanais = useCallback(async (termo: string) => {
    setBuscando(true)
    setErro(null)
    try {
      const res = await fetch(`/api/m3u-listas/${lista.id}/canais?busca=${encodeURIComponent(termo)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCanais(data)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao buscar canais')
    } finally {
      setBuscando(false)
    }
  }, [lista.id])

  useEffect(() => { buscarCanais('telecine') }, [buscarCanais])

  async function handleSelecionarCanal(streamId: number, nome: string) {
    setSalvando(true)
    try { await onSalvar(String(streamId), nome); onFechar() }
    catch { setErro('Erro ao salvar canal') }
    finally { setSalvando(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => e.target === e.currentTarget && onFechar()}>
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Canal de teste</h2>
            <p className="text-xs text-gray-400 mt-0.5">{lista.nome}</p>
          </div>
          <button onClick={onFechar} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>
        <div className="p-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Buscar canal..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && buscarCanais(busca)}
            />
            <button onClick={() => buscarCanais(busca)} disabled={buscando}
              className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {buscando ? '...' : 'Buscar'}
            </button>
          </div>
          {lista.stream_teste_id && (
            <p className="text-xs text-gray-400 mt-2">Atual: ID {lista.stream_teste_id}</p>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto">
          {erro && <p className="text-sm text-red-500 px-4 py-3">{erro}</p>}
          {canais.length === 0 && !buscando && !erro && (
            <p className="text-sm text-gray-400 px-4 py-3">Nenhum canal encontrado</p>
          )}
          {canais.map(canal => (
            <button key={canal.stream_id} onClick={() => handleSelecionarCanal(canal.stream_id, canal.nome)}
              disabled={salvando}
              className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800 last:border-0 disabled:opacity-50">
              <p className="text-sm text-gray-800 dark:text-gray-200">{canal.nome}</p>
              <p className="text-xs text-gray-400">ID: {canal.stream_id} {canal.categoria && `· ${canal.categoria}`}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Card de Lista ────────────────────────────────────────────────────────────

function CardLista({ lista, agora, mediasHistorico, periodoHoras, testandoRapido, testandoCompleto, onToggleAtivo, onExcluir, onTestarRapido, onTestarCompleto, onSalvarCanalTeste }: {
  lista: Lista
  agora: number
  mediasHistorico: HistoricoMedias | null
  periodoHoras: number
  testandoRapido: boolean
  testandoCompleto: boolean
  onToggleAtivo: (id: number, ativo: boolean) => void
  onExcluir: (id: number, nome: string) => void
  onTestarRapido: (id: number) => void
  onTestarCompleto: (id: number) => void
  onSalvarCanalTeste: (id: number, streamId: string, nome: string) => Promise<void>
}) {
  const [modalCanalAberto, setModalCanalAberto] = useState(false)
  const cfg      = statusConfig(lista.ultimo_status)
  const score    = scoreQualidade(lista, mediasHistorico)
  const testando = testandoRapido || testandoCompleto

  // Usa médias do período se disponível, senão usa último teste
  const pingExibido   = mediasHistorico?.ping_medio   ?? lista.ping_ms
  const jitterExibido = mediasHistorico?.jitter_medio ?? lista.jitter_ms
  const ttfbExibido   = mediasHistorico?.ttfb_medio   ?? lista.ttfb_ms
  const uptimeExibido = mediasHistorico?.uptime_pct   ?? lista.uptime_24h

  const labelPeriodo = PERIODOS.find(p => p.horas === periodoHoras)?.label ?? '24h'

  return (
    <div className={`relative bg-white dark:bg-gray-900 rounded-xl border-2 ${cfg.cor} transition-all duration-300 overflow-hidden ${!lista.ativo ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between p-4 pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex-shrink-0">
            <div className={`w-3 h-3 rounded-full ${cfg.bg}`} />
            {lista.ultimo_status === 'online' && (
              <div className={`absolute inset-0 rounded-full ${cfg.bg} opacity-40 animate-ping`} />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate text-sm">{lista.nome}</h3>
            <p className="text-xs text-gray-400 truncate mt-0.5">
              {lista.tipo === 'xtream' ? `Xtream · ${lista.host}` : lista.url_m3u}
            </p>
          </div>
        </div>
        <div className="flex-shrink-0 text-right ml-2">
          {score !== null ? (
            <>
              <span className={`text-xl font-bold ${corScore(score)}`}>{score}</span>
              <p className="text-xs text-gray-400 leading-none">/ 10</p>
            </>
          ) : (
            <span className="text-xs text-gray-400">s/ dados</span>
          )}
        </div>
      </div>

      {/* Métricas — baseadas no período selecionado */}
      <div className="grid grid-cols-4 gap-0 border-t border-b border-gray-100 dark:border-gray-800">
        {[
          { label: 'Ping',   value: formatNum(pingExibido,   'ms') },
          { label: 'Jitter', value: formatNum(jitterExibido, 'ms') },
          { label: 'TTFB',   value: ttfbExibido != null ? formatNum(ttfbExibido, 'ms') : '—' },
          { label: 'Uptime', value: formatNum(uptimeExibido, '%') },
        ].map(({ label, value }) => (
          <div key={label} className="py-2 px-1 text-center">
            <p className="text-xs text-gray-400 leading-none">{label}</p>
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {/* Badge indicando período das médias */}
      {mediasHistorico && (
        <div className="px-4 py-1 bg-blue-50 dark:bg-blue-900/10 border-b border-blue-100 dark:border-blue-900/20">
          <p className="text-[10px] text-blue-500 dark:text-blue-400">
            📊 Médias dos últimos {labelPeriodo} · {mediasHistorico.total_testes} testes
          </p>
        </div>
      )}

      {lista.total_geral ? (
        <div className="grid grid-cols-3 border-b border-gray-100 dark:border-gray-800">
          {[
            { label: 'Canais', valor: lista.total_canais, cor: 'text-blue-600 dark:text-blue-400' },
            { label: 'Filmes', valor: lista.total_filmes, cor: 'text-purple-600 dark:text-purple-400' },
            { label: 'Séries', valor: lista.total_series, cor: 'text-pink-600 dark:text-pink-400' },
          ].map(({ label, valor, cor }) => (
            <div key={label} className="py-2 px-1 text-center">
              <p className="text-xs text-gray-400 leading-none">{label}</p>
              <p className={`text-sm font-semibold mt-0.5 ${cor}`}>{(valor ?? 0).toLocaleString('pt-BR')}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-4 py-2 text-xs text-gray-400 border-b border-gray-100 dark:border-gray-800">
          Contagens disponíveis após 1º download completo
        </div>
      )}

      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badgeCor}`}>{cfg.label}</span>
          <span className="text-xs text-gray-400">{tempoAtras(lista.ultimo_teste_em, agora)}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onTestarRapido(lista.id)} disabled={testando} title="Teste rápido"
            className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-400 hover:text-blue-500 disabled:opacity-40 transition-colors text-xs">
            {testandoRapido ? <span className="inline-block animate-spin text-sm">↻</span> : <><span className="text-sm">⚡</span><span className="hidden sm:inline">Rápido</span></>}
          </button>
          <button onClick={() => onTestarCompleto(lista.id)} disabled={testando} title="Teste completo"
            className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 text-gray-400 hover:text-purple-500 disabled:opacity-40 transition-colors text-xs">
            {testandoCompleto ? <span className="inline-block animate-spin text-sm">↻</span> : <><span className="text-sm">▷</span><span className="hidden sm:inline">Completo</span></>}
          </button>
          <button onClick={() => setModalCanalAberto(true)} title="Canal de teste"
            className={`p-1.5 rounded-lg transition-colors text-sm ${lista.stream_teste_id ? 'text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
            🎯
          </button>
          <button onClick={() => onToggleAtivo(lista.id, !lista.ativo)} title={lista.ativo ? 'Desativar' : 'Ativar'}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 transition-colors text-sm">
            {lista.ativo ? '⏸' : '▶'}
          </button>
          <button onClick={() => onExcluir(lista.id, lista.nome)} title="Excluir"
            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors text-sm">
            🗑
          </button>
        </div>
      </div>

      {uptimeExibido !== null && (
        <div className="h-0.5 bg-gray-100 dark:bg-gray-800">
          <div className={`h-full transition-all duration-500 ${uptimeExibido >= 90 ? 'bg-green-500' : uptimeExibido >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${uptimeExibido}%` }} />
        </div>
      )}

      {modalCanalAberto && (
        <ModalCanalTeste lista={lista} onFechar={() => setModalCanalAberto(false)}
          onSalvar={(streamId, nome) => onSalvarCanalTeste(lista.id, streamId, nome)} />
      )}
    </div>
  )
}

// ─── Modal Nova Lista ─────────────────────────────────────────────────────────

function ModalNovaLista({ onFechar, onSalvar }: {
  onFechar: () => void
  onSalvar: (data: FormData) => Promise<void>
}) {
  const [form, setForm] = useState<FormData>(FORM_INICIAL)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  function set(campo: keyof FormData, valor: string | boolean) {
    setForm(prev => ({ ...prev, [campo]: valor }))
  }

  async function handleSubmit() {
    setSalvando(true)
    setErro(null)
    try { await onSalvar(form); onFechar() }
    catch (e: unknown) { setErro(e instanceof Error ? e.message : 'Erro ao salvar') }
    finally { setSalvando(false) }
  }

  const inputCls = 'w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-400'
  const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={e => e.target === e.currentTarget && onFechar()}>
      <div className="w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Nova lista M3U</h2>
          <button onClick={onFechar} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
        </div>
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {erro && <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 px-3 py-2 text-sm text-red-600 dark:text-red-400">{erro}</div>}
          <div>
            <label className={labelCls}>Nome da lista *</label>
            <input className={inputCls} placeholder="Ex: Servidor Principal" value={form.nome} onChange={e => set('nome', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Tipo de conexão</label>
            <div className="flex gap-2">
              {(['url', 'xtream'] as const).map(t => (
                <button key={t} onClick={() => set('tipo', t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${form.tipo === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-blue-400'}`}>
                  {t === 'url' ? '🔗 URL M3U' : '📡 Xtream Codes'}
                </button>
              ))}
            </div>
          </div>
          {form.tipo === 'url' ? (
            <div>
              <label className={labelCls}>URL da lista M3U *</label>
              <input className={inputCls} placeholder="http://servidor.com/lista.m3u" value={form.url_m3u} onChange={e => set('url_m3u', e.target.value)} />
            </div>
          ) : (
            <>
              <div>
                <label className={labelCls}>Host *</label>
                <input className={inputCls} placeholder="http://servidor.com" value={form.host} onChange={e => set('host', e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Usuário *</label>
                  <input className={inputCls} placeholder="usuario" value={form.usuario} onChange={e => set('usuario', e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Senha *</label>
                  <input className={inputCls} type="password" placeholder="••••••" value={form.senha} onChange={e => set('senha', e.target.value)} />
                </div>
              </div>
            </>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Intervalo de teste (min)</label>
              <select className={inputCls} value={form.intervalo_teste_min} onChange={e => set('intervalo_teste_min', e.target.value)}>
                {[5, 10, 15, 30, 60].map(v => <option key={v} value={v}>A cada {v} min</option>)}
              </select>
            </div>
            <div className="flex flex-col justify-end gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.ativo} onChange={e => set('ativo', e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Ativo</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.indexar_conteudo} onChange={e => set('indexar_conteudo', e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                <span className="text-sm text-gray-700 dark:text-gray-300">Indexar catálogo</span>
              </label>
            </div>
          </div>
          {form.indexar_conteudo && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              ⚠️ Indexar catálogo salva todos os títulos no banco. Recomendado para listas com menos de 50k itens.
            </div>
          )}
        </div>
        <div className="flex gap-2 justify-end px-5 py-4 border-t border-gray-100 dark:border-gray-800">
          <button onClick={onFechar} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">Cancelar</button>
          <button onClick={handleSubmit} disabled={salvando}
            className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {salvando ? 'Salvando...' : 'Salvar lista'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function TesteListasPage() {
  const [listas, setListas] = useState<Lista[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modalAberto, setModalAberto] = useState(false)
  const [filtro, setFiltro] = useState<'todas' | 'online' | 'offline'>('todas')
  const [testandoRapidoIds, setTestandoRapidoIds] = useState<Set<number>>(new Set())
  const [testandoCompletoIds, setTestandoCompletoIds] = useState<Set<number>>(new Set())
  const [testandomTodos, setTestandoTodos] = useState(false)
  const [erroExcluir, setErroExcluir] = useState<string | null>(null)
  const [configAberta, setConfigAberta] = useState(false)
  const [salvandoConfig, setSalvandoConfig] = useState(false)
  const [historico, setHistorico] = useState<Historico | null>(null)
  const [periodoHoras, setPeriodoHoras] = useState(24)
  const [abaGrafico, setAbaGrafico] = useState<'radar' | 'latencias' | 'uptime' | 'ping' | 'velocidade' | 'catalogo'>('radar')

  // Tick a cada 15s para atualizar "X min atrás" nos cards
  const [agora, setAgora] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 15_000)
    return () => clearInterval(t)
  }, [])

  const carregarHistorico = useCallback(async (horas: number) => {
    try {
      const res = await fetch(`/api/m3u-testes/historico?horas=${horas}`)
      const data = await res.json()
      setHistorico(data)
    } catch { console.error('Erro ao carregar histórico') }
  }, [])

  const carregar = useCallback(async () => {
    try {
      const res = await fetch('/api/m3u-listas')
      const data = await res.json()
      setListas(data)
    } catch { console.error('Erro ao carregar listas') }
    finally { setCarregando(false) }
  }, [])

  useEffect(() => {
    carregar()
    carregarHistorico(periodoHoras)
    const interval = setInterval(() => { carregar(); carregarHistorico(periodoHoras) }, 30_000)
    return () => clearInterval(interval)
  }, [carregar, carregarHistorico, periodoHoras])

  // Muda período — atualiza cards e gráficos juntos
  function handleMudarPeriodo(horas: number) {
    setPeriodoHoras(horas)
    carregarHistorico(horas)
  }

  // Busca médias do histórico para uma lista pelo nome
  function getMediasLista(lista: Lista): HistoricoMedias | null {
    return historico?.medias.find(m => m.nome === lista.nome) ?? null
  }

  async function handleTestarTodos() {
    if (testandomTodos) return
    setTestandoTodos(true)
    const ids = listasFiltradas.map(l => l.id)
    for (const id of ids) {
      setTestandoRapidoIds(prev => new Set(prev).add(id))
      try {
        await fetch('/api/m3u-testes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lista_id: id, rapido: true }),
        })
        await carregar()
        setAgora(Date.now())
      } catch { console.error('Erro ao testar lista', id) }
      finally { setTestandoRapidoIds(prev => { const next = new Set(prev); next.delete(id); return next }) }
      await new Promise(r => setTimeout(r, 500))
    }
    setTestandoTodos(false)
    carregarHistorico(periodoHoras)
  }

  async function handleSalvarIntervalo(minutos: number) {
    setSalvandoConfig(true)
    try {
      await Promise.all(listas.map(l => fetch(`/api/m3u-listas/${l.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalo_teste_min: minutos }),
      })))
      await carregar()
      setConfigAberta(false)
    } finally { setSalvandoConfig(false) }
  }

  async function handleSalvar(form: FormData) {
    const res = await fetch('/api/m3u-listas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, porta: form.porta ? parseInt(form.porta) : null, intervalo_teste_min: parseInt(form.intervalo_teste_min) }),
    })
    if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Erro ao salvar') }
    await carregar()
  }

  async function handleToggleAtivo(id: number, ativo: boolean) {
    await fetch(`/api/m3u-listas/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo }) })
    await carregar()
  }

  async function handleExcluir(id: number, nome: string) {
    if (!confirm(`Excluir a lista "${nome}"? Todos os testes e histórico serão removidos.`)) return
    setErroExcluir(null)
    try {
      const res = await fetch(`/api/m3u-listas/${id}`, { method: 'DELETE' })
      if (!res.ok) { const data = await res.json().catch(() => ({})); setErroExcluir(data.error || `Erro ao excluir (HTTP ${res.status})`); return }
      await carregar()
    } catch { setErroExcluir('Erro de conexão ao tentar excluir') }
  }

  async function handleSalvarCanalTeste(id: number, streamId: string, nome: string) {
    await fetch(`/api/m3u-listas/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stream_teste_id: streamId }) })
    console.log(`Canal teste configurado para lista ${id}: ${nome} (ID: ${streamId})`)
    await carregar()
  }

  async function handleTestarRapido(id: number) {
    setTestandoRapidoIds(prev => new Set(prev).add(id))
    try {
      await fetch('/api/m3u-testes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lista_id: id, rapido: true }) })
      await carregar()
      setAgora(Date.now())
    } catch { console.error('Erro ao testar lista', id) }
    finally { setTestandoRapidoIds(prev => { const next = new Set(prev); next.delete(id); return next }) }
  }

  async function handleTestarCompleto(id: number) {
    setTestandoCompletoIds(prev => new Set(prev).add(id))
    try {
      await fetch('/api/m3u-testes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lista_id: id, rapido: false }) })
      await carregar()
      setAgora(Date.now())
    } catch { console.error('Erro ao testar lista', id) }
    finally { setTestandoCompletoIds(prev => { const next = new Set(prev); next.delete(id); return next }) }
  }

  const online   = listas.filter(l => l.ultimo_status === 'online').length
  const offline  = listas.filter(l => l.ultimo_status && l.ultimo_status !== 'online').length
  const semDados = listas.filter(l => !l.ultimo_status).length

  const listasFiltradas = listas.filter(l => {
    if (filtro === 'online') return l.ultimo_status === 'online'
    if (filtro === 'offline') return l.ultimo_status && l.ultimo_status !== 'online'
    return true
  })

  const ABAS = [
    { id: 'radar',      label: '🕸 Radar' },
    { id: 'latencias',  label: '📶 Latências' },
    { id: 'uptime',     label: '✅ Uptime' },
    { id: 'ping',       label: '📈 Ping/Tempo' },
    { id: 'velocidade', label: '⚡ Velocidade' },
    { id: 'catalogo',   label: '📦 Catálogo' },
  ] as const

  const labelPeriodoAtual = PERIODOS.find(p => p.horas === periodoHoras)?.label ?? '24h'

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Teste de listas</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Monitoramento de servidores M3U e Xtream Codes</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleTestarTodos} disabled={testandomTodos}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            <span className={testandomTodos ? 'inline-block animate-spin' : ''}>↻</span>
            {testandomTodos
              ? `Testando ${testandoRapidoIds.size > 0 ? `(${listasFiltradas.findIndex(l => testandoRapidoIds.has(l.id)) + 1}/${listasFiltradas.length})` : ''}...`
              : 'Atualizar'}
          </button>
          <button onClick={() => setConfigAberta(v => !v)}
            className={`px-3 py-2 text-sm border rounded-lg transition-colors ${configAberta ? 'bg-gray-100 dark:bg-gray-800 border-gray-300' : 'text-gray-500 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
            ⚙ Configurar
          </button>
          <button onClick={() => setModalAberto(true)} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
            + Nova lista
          </button>
        </div>
      </div>

      {/* Config */}
      {configAberta && (
        <div className="mb-6 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Configurações de teste</h2>
            <span className="text-xs text-gray-400">Aplicado a todas as listas</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Intervalo do cron (n8n)</p>
              <div className="flex gap-2">
                {[5, 10, 15, 30, 60].map(min => {
                  const atual = listas.length > 0 ? listas[0].intervalo_teste_min : 15
                  return (
                    <button key={min} onClick={() => handleSalvarIntervalo(min)} disabled={salvandoConfig}
                      className={`px-3 py-1.5 text-xs rounded-lg border transition-colors disabled:opacity-50 ${atual === min ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 text-gray-600 border-gray-200 dark:border-gray-700 hover:border-blue-400'}`}>
                      {min < 60 ? `${min}min` : '1h'}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="border-l border-gray-200 dark:border-gray-700 pl-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">URL interna (n8n)</p>
              <p className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-gray-700 dark:text-gray-300 select-all">
                http://js_painel:3000/api/m3u-testes
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Seletor de período — compartilhado entre cards e gráficos */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Período de análise:</span>
        <div className="flex gap-1">
          {PERIODOS.map(p => (
            <button key={p.horas} onClick={() => handleMudarPeriodo(p.horas)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${periodoHoras === p.horas ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-900 text-gray-500 border-gray-200 dark:border-gray-700 hover:border-blue-400'}`}>
              {p.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">Score e métricas baseados em médias de {labelPeriodoAtual}</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total',     valor: listas.length, cor: 'text-gray-900 dark:text-gray-100', filtroVal: 'todas'   as const },
          { label: 'Online',    valor: online,        cor: 'text-green-600 dark:text-green-400', filtroVal: 'online' as const },
          { label: 'Offline',   valor: offline,       cor: 'text-red-600 dark:text-red-400',   filtroVal: 'offline' as const },
          { label: 'Sem dados', valor: semDados,      cor: 'text-gray-400',                    filtroVal: 'todas'   as const },
        ].map(({ label, valor, cor, filtroVal }) => (
          <button key={label} onClick={() => setFiltro(filtroVal)}
            className={`text-left p-4 rounded-xl border transition-all ${filtro === filtroVal && filtroVal !== 'todas' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-gray-300'}`}>
            <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${cor}`}>{valor}</p>
          </button>
        ))}
      </div>

      {erroExcluir && (
        <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 px-4 py-3 text-sm text-red-600 flex items-center justify-between">
          <span>⚠ {erroExcluir}</span>
          <button onClick={() => setErroExcluir(null)} className="ml-4 text-red-400 hover:text-red-600">✕</button>
        </div>
      )}

      {/* Cards */}
      {carregando ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-gray-400 text-sm">Carregando listas...</div>
        </div>
      ) : listasFiltradas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <p className="text-gray-400 text-sm">{listas.length === 0 ? 'Nenhuma lista cadastrada ainda.' : 'Nenhuma lista com esse filtro.'}</p>
          {listas.length === 0 && <button onClick={() => setModalAberto(true)} className="mt-3 text-sm text-blue-600 hover:underline">Cadastrar primeira lista →</button>}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {listasFiltradas.map(lista => (
            <CardLista
              key={lista.id}
              lista={lista}
              agora={agora}
              mediasHistorico={getMediasLista(lista)}
              periodoHoras={periodoHoras}
              testandoRapido={testandoRapidoIds.has(lista.id)}
              testandoCompleto={testandoCompletoIds.has(lista.id)}
              onToggleAtivo={handleToggleAtivo}
              onExcluir={handleExcluir}
              onTestarRapido={handleTestarRapido}
              onTestarCompleto={handleTestarCompleto}
              onSalvarCanalTeste={handleSalvarCanalTeste}
            />
          ))}
        </div>
      )}

      {/* Gráficos */}
      {historico && historico.medias.length > 0 && (
        <div className="mt-10 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Análise comparativa</h2>
            <p className="text-xs text-gray-400 mt-0.5">Período: últimos {labelPeriodoAtual}</p>
          </div>

          <div className="flex gap-1 flex-wrap border-b border-gray-200 dark:border-gray-800">
            {ABAS.map(aba => (
              <button key={aba.id} onClick={() => setAbaGrafico(aba.id)}
                className={`px-3 py-2 text-xs font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${abaGrafico === aba.id ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
                {aba.label}
              </button>
            ))}
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
            {abaGrafico === 'radar' && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Score por dimensão (0–100, maior = melhor)</h3>
                <RadarQualidade medias={historico.medias} />
              </div>
            )}
            {abaGrafico === 'latencias' && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ping · Jitter · TTFB médios (ms)</h3>
                <p className="text-xs text-gray-400 mb-4">Menores valores indicam melhor desempenho</p>
                <GraficoLatencias medias={historico.medias} />
              </div>
            )}
            {abaGrafico === 'uptime' && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Uptime ao longo do tempo (%)</h3>
                <p className="text-xs text-gray-400 mb-4">Disponibilidade de cada servidor no período</p>
                <GraficoUptimeTempo serie={historico.serie} servidores={historico.servidores} />
              </div>
            )}
            {abaGrafico === 'ping' && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ping ao longo do tempo (ms)</h3>
                <p className="text-xs text-gray-400 mb-4">Variação de latência de cada servidor</p>
                <GraficoPingTempo serie={historico.serie} servidores={historico.servidores} />
              </div>
            )}
            {abaGrafico === 'velocidade' && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Velocidade de download média (Mb/s)</h3>
                <p className="text-xs text-gray-400 mb-4">Disponível apenas após testes completos</p>
                <GraficoVelocidade medias={historico.medias} />
              </div>
            )}
            {abaGrafico === 'catalogo' && historico.contagens && historico.contagens.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">Catálogo por servidor</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={historico.contagens} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="nome" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                    <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v, name) => [Number(v).toLocaleString('pt-BR'), name]} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="total_canais" name="Canais" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="total_filmes" name="Filmes" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="total_series" name="Séries" fill="#ec4899" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Resumo comparativo</h3>
            </div>
            <TabelaComparativa medias={historico.medias} servidores={historico.servidores} />
          </div>
        </div>
      )}

      {modalAberto && <ModalNovaLista onFechar={() => setModalAberto(false)} onSalvar={handleSalvar} />}
    </div>
  )
}