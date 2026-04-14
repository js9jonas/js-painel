'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'

// ─── Types ───────────────────────────────────────────────────────────────────

type AgentResponse = {
  type: 'text' | 'table' | 'bar_chart' | 'line_chart' | 'pie_chart' | 'kpi_cards'
  message: string
  data?: {
    columns?: string[]
    rows?: unknown[][]
    title?: string
    labels?: string[]
    datasets?: Array<{ name: string; data: number[] }>
    cards?: Array<{ label: string; value: string | number; suffix?: string }>
  }
}

type UserMsg = { role: 'user'; content: string }
type AgentMsg = { role: 'assistant'; content: AgentResponse }
type ChatMessage = UserMsg | AgentMsg

type Learning = {
  id: number
  categoria: string
  conteudo: string
  pergunta_origem: string | null
  ativo: boolean
  criado_em: string
}

// ─── Chart helpers ────────────────────────────────────────────────────────────

const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899']

function toRechartsData(labels: string[], datasets: Array<{ name: string; data: number[] }>) {
  return labels.map((label, i) => {
    const point: Record<string, string | number> = { name: label }
    for (const ds of datasets) point[ds.name] = ds.data[i] ?? 0
    return point
  })
}

// ─── Markdown inline renderer ────────────────────────────────────────────────

function renderMd(text: string): React.ReactNode {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\)|\n)/g)
  return parts.map((part, i) => {
    if (part === '\n') return <br key={i} />
    const m = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
    if (m) {
      return (
        <Link key={i} href={m[2]} className="text-indigo-600 hover:underline font-medium">
          {m[1]}
        </Link>
      )
    }
    return part
  })
}

// ─── Response renderers ───────────────────────────────────────────────────────

function TableResponse({ data }: { data: NonNullable<AgentResponse['data']> }) {
  const { columns = [], rows = [] } = data
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-200 mt-2">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-zinc-100 border-b border-zinc-200">
            {columns.map((col) => (
              <th key={col} className="px-4 py-2.5 text-left font-semibold text-zinc-700 whitespace-nowrap">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? 'bg-white' : 'bg-zinc-50'}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-4 py-2 text-zinc-700 whitespace-nowrap">
                  {cell === null || cell === undefined ? '—' : renderMd(String(cell))}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-4 text-center text-zinc-400">
                Nenhum resultado.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function BarChartResponse({ data }: { data: NonNullable<AgentResponse['data']> }) {
  const { title, labels = [], datasets = [] } = data
  const chartData = toRechartsData(labels, datasets)
  return (
    <div className="mt-2">
      {title && <p className="text-sm font-semibold text-zinc-700 mb-2">{title}</p>}
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          {datasets.map((ds, i) => (
            <Bar key={ds.name} dataKey={ds.name} fill={CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function LineChartResponse({ data }: { data: NonNullable<AgentResponse['data']> }) {
  const { title, labels = [], datasets = [] } = data
  const chartData = toRechartsData(labels, datasets)
  return (
    <div className="mt-2">
      {title && <p className="text-sm font-semibold text-zinc-700 mb-2">{title}</p>}
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          {datasets.map((ds, i) => (
            <Line
              key={ds.name}
              type="monotone"
              dataKey={ds.name}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function PieChartResponse({ data }: { data: NonNullable<AgentResponse['data']> }) {
  const { title, labels = [], datasets = [] } = data
  const pieData = labels.map((label, i) => ({
    name: label,
    value: datasets[0]?.data[i] ?? 0,
  }))
  return (
    <div className="mt-2">
      {title && <p className="text-sm font-semibold text-zinc-700 mb-2">{title}</p>}
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            outerRadius={100}
            dataKey="value"
            label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} (${((percent ?? 0) * 100).toFixed(0)}%)`}
            labelLine={false}
          >
            {pieData.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

function KpiCardsResponse({ data }: { data: NonNullable<AgentResponse['data']> }) {
  const { cards = [] } = data
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
      {cards.map((card, i) => (
        <div key={i} className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
          <p className="text-xs font-medium text-indigo-600 mb-1">{card.label}</p>
          <p className="text-2xl font-bold text-indigo-900">
            {card.value}
            {card.suffix && <span className="text-sm font-normal ml-1">{card.suffix}</span>}
          </p>
        </div>
      ))}
    </div>
  )
}

function AgentResponseBlock({ res }: { res: AgentResponse }) {
  return (
    <div>
      <p className="text-sm text-zinc-700 leading-relaxed">{renderMd(res.message)}</p>
      {res.type === 'table' && res.data && <TableResponse data={res.data} />}
      {res.type === 'bar_chart' && res.data && <BarChartResponse data={res.data} />}
      {res.type === 'line_chart' && res.data && <LineChartResponse data={res.data} />}
      {res.type === 'pie_chart' && res.data && <PieChartResponse data={res.data} />}
      {res.type === 'kpi_cards' && res.data && <KpiCardsResponse data={res.data} />}
    </div>
  )
}

// ─── Discuss modal ───────────────────────────────────────────────────────────

type DiscussMessage = { role: 'user' | 'assistant'; content: string; suggested_update?: string | null }

function DiscussModal({ learning, onClose, onApply }: {
  learning: Learning
  onClose: () => void
  onApply: (newContent: string) => void
}) {
  const [messages, setMessages] = useState<DiscussMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const cat = CATEGORY_LABELS[learning.categoria]

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    setInput('')

    const next: DiscussMessage[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(next)
    setLoading(true)

    try {
      const res = await fetch(`/api/agent/learnings/${learning.id}/discuss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `Erro ${res.status}`)
      setMessages([...next, {
        role: 'assistant',
        content: data.message,
        suggested_update: data.suggested_update ?? null,
      }])
    } catch (err: unknown) {
      setMessages([...next, {
        role: 'assistant',
        content: `⚠️ ${err instanceof Error ? err.message : 'Erro ao conectar.'}`,
      }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const lastSuggestion = [...messages].reverse().find(
    (m) => m.role === 'assistant' && m.suggested_update
  )?.suggested_update ?? null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">
        {/* Modal header */}
        <div className="px-5 py-4 border-b border-zinc-100 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${cat?.color ?? 'bg-zinc-100 text-zinc-600'}`}>
                {cat?.label ?? learning.categoria}
              </span>
              <span className="text-xs text-zinc-400">Refinamento de aprendizado</span>
            </div>
            <p className="text-sm text-zinc-800 font-medium leading-snug">{learning.conteudo}</p>
            {learning.pergunta_origem && (
              <p className="text-xs text-zinc-400 mt-1 truncate">↳ &ldquo;{learning.pergunta_origem}&rdquo;</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors flex-shrink-0"
          >
            ✕
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-zinc-500">Faça perguntas sobre este aprendizado.</p>
              <p className="text-xs text-zinc-400 mt-1">O agente pode explicar, corrigir ou sugerir uma nova versão.</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'user' ? (
                <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-2.5 text-sm text-white">
                  {msg.content}
                </div>
              ) : (
                <div className="max-w-[85%] space-y-2">
                  <div className="rounded-2xl rounded-tl-sm bg-zinc-50 border border-zinc-200 px-4 py-2.5 text-sm text-zinc-700 leading-relaxed">
                    {msg.content}
                  </div>
                  {msg.suggested_update && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                      <p className="text-xs font-semibold text-emerald-700 mb-1.5">✦ Sugestão de novo conteúdo</p>
                      <p className="text-sm text-emerald-900 leading-snug">{msg.suggested_update}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-tl-sm bg-zinc-50 border border-zinc-200 px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Apply suggestion bar */}
        {lastSuggestion && (
          <div className="px-4 py-3 border-t border-emerald-100 bg-emerald-50 flex items-center gap-3">
            <p className="flex-1 text-xs text-emerald-700 truncate">
              <span className="font-semibold">Sugestão disponível:</span> {lastSuggestion}
            </p>
            <button
              onClick={() => onApply(lastSuggestion)}
              className="flex-shrink-0 rounded-xl bg-emerald-600 text-white text-xs font-medium px-4 py-2 hover:bg-emerald-700 transition-colors"
            >
              Aplicar
            </button>
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-zinc-100 flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
            disabled={loading}
            placeholder="Pergunte sobre este aprendizado…"
            rows={1}
            autoFocus
            className="flex-1 resize-none rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
            style={{ maxHeight: '120px', overflowY: 'auto' }}
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = 'auto'
              el.style.height = Math.min(el.scrollHeight, 120) + 'px'
            }}
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            className="h-10 w-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Learnings panel ──────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  schema_fact:    { label: 'Schema',         color: 'bg-blue-100 text-blue-700' },
  business_rule:  { label: 'Regra negócio',  color: 'bg-purple-100 text-purple-700' },
  query_pattern:  { label: 'Padrão query',   color: 'bg-emerald-100 text-emerald-700' },
  value_meaning:  { label: 'Valor/coluna',   color: 'bg-amber-100 text-amber-700' },
}

function LearningsPanel() {
  const [learnings, setLearnings] = useState<Learning[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [discussing, setDiscussing] = useState<Learning | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/agent/learnings')
      const data = await res.json()
      setLearnings(Array.isArray(data) ? data : [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function applyUpdate(id: number, newContent: string) {
    setLearnings((prev) => prev.map((l) => l.id === id ? { ...l, conteudo: newContent } : l))
    setDiscussing((prev) => prev?.id === id ? { ...prev, conteudo: newContent } : prev)
    await fetch(`/api/agent/learnings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conteudo: newContent }),
    })
  }

  async function toggleAtivo(id: number, ativo: boolean) {
    setLearnings((prev) => prev.map((l) => l.id === id ? { ...l, ativo } : l))
    await fetch(`/api/agent/learnings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo }),
    })
  }

  async function remove(id: number) {
    setLearnings((prev) => prev.filter((l) => l.id !== id))
    await fetch(`/api/agent/learnings/${id}`, { method: 'DELETE' })
  }

  const ativos = learnings.filter((l) => l.ativo).length
  const categories = ['all', ...Array.from(new Set(learnings.map((l) => l.categoria)))]
  const visible = filter === 'all' ? learnings : learnings.filter((l) => l.categoria === filter)

  return (
    <div className="flex flex-col gap-4">
      {/* Stats */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-zinc-500">{learnings.length} aprendizados</span>
        <span className="text-emerald-600 font-medium">{ativos} ativos</span>
        <span className="text-zinc-400">{learnings.length - ativos} inativos</span>
        <button onClick={load} className="ml-auto text-xs text-zinc-400 hover:text-zinc-600 border border-zinc-200 rounded-lg px-3 py-1.5 transition-colors">
          Atualizar
        </button>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-1.5">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`text-xs rounded-full px-3 py-1 border transition-colors ${
              filter === cat
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'border-zinc-200 text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            {cat === 'all' ? 'Todos' : (CATEGORY_LABELS[cat]?.label ?? cat)}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-sm text-zinc-400 py-8 text-center">Carregando…</div>
      ) : visible.length === 0 ? (
        <div className="text-sm text-zinc-400 py-8 text-center">
          {learnings.length === 0
            ? 'Nenhum aprendizado ainda. Use o agente para começar a acumular contexto.'
            : 'Nenhum aprendizado nesta categoria.'}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((l) => {
            const cat = CATEGORY_LABELS[l.categoria]
            return (
              <div
                key={l.id}
                className={`rounded-xl border px-4 py-3 flex gap-3 items-start transition-opacity ${
                  l.ativo ? 'bg-white border-zinc-200' : 'bg-zinc-50 border-zinc-100 opacity-50'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${cat?.color ?? 'bg-zinc-100 text-zinc-600'}`}>
                      {cat?.label ?? l.categoria}
                    </span>
                    <span className="text-xs text-zinc-400">
                      {new Date(l.criado_em).toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-800 leading-snug">{l.conteudo}</p>
                  {l.pergunta_origem && (
                    <p className="text-xs text-zinc-400 mt-1 truncate" title={l.pergunta_origem}>
                      ↳ &ldquo;{l.pergunta_origem}&rdquo;
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setDiscussing(l)}
                    title="Discutir este aprendizado"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors text-sm"
                  >
                    💬
                  </button>
                  <button
                    onClick={() => toggleAtivo(l.id, !l.ativo)}
                    title={l.ativo ? 'Desativar' : 'Ativar'}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-colors ${
                      l.ativo
                        ? 'text-emerald-600 hover:bg-emerald-50'
                        : 'text-zinc-400 hover:bg-zinc-100'
                    }`}
                  >
                    {l.ativo ? '✓' : '○'}
                  </button>
                  <button
                    onClick={() => remove(l.id)}
                    title="Excluir"
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-colors text-sm"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {discussing && (
        <DiscussModal
          learning={discussing}
          onClose={() => setDiscussing(null)}
          onApply={(newContent) => applyUpdate(discussing.id, newContent)}
        />
      )}
    </div>
  )
}

// ─── Suggestions ─────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'Quantos clientes ativos temos hoje?',
  'Mostre os 10 clientes com vencimento mais próximo',
  'Qual a distribuição de clientes por servidor?',
  'Quais são as tabelas disponíveis no banco?',
  'Clientes novos por mês nos últimos 6 meses',
]

// ─── Main component ───────────────────────────────────────────────────────────

type Tab = 'chat' | 'learnings'

export default function AgentChat() {
  const [tab, setTab] = useState<Tab>('chat')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    setInput('')
    setError(null)

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(newMessages)
    setLoading(true)

    try {
      const apiMessages = newMessages.map((m) => ({
        role: m.role,
        content: m.role === 'user' ? m.content : m.content.message,
      }))

      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      })

      const data: AgentResponse & { error?: string } = await res.json()

      if (!res.ok || data.error) throw new Error(data.error ?? `Erro ${res.status}`)

      setMessages([...newMessages, { role: 'assistant', content: data }])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao conectar ao agente.')
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem-3rem)]">
      {/* Header + tabs */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">🤖 Agente IA</h1>
            <p className="text-sm text-zinc-500 mt-0.5">Analise dados do JS Painel em linguagem natural</p>
          </div>
          <div className="flex items-center gap-1 border border-zinc-200 rounded-xl p-1 bg-white">
            <button
              onClick={() => setTab('chat')}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === 'chat'
                  ? 'bg-indigo-600 text-white'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              💬 Chat
            </button>
            <button
              onClick={() => setTab('learnings')}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                tab === 'learnings'
                  ? 'bg-indigo-600 text-white'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}
            >
              🧠 Aprendizados
            </button>
          </div>
        </div>
        {tab === 'chat' && messages.length > 0 && (
          <button
            onClick={() => { setMessages([]); setError(null) }}
            className="text-xs text-zinc-400 hover:text-zinc-600 border border-zinc-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            Limpar conversa
          </button>
        )}
      </div>

      {/* Tab: Aprendizados */}
      {tab === 'learnings' && (
        <div className="flex-1 overflow-y-auto">
          <LearningsPanel />
        </div>
      )}

      {/* Tab: Chat */}
      {tab === 'chat' && (
        <>
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-6 text-center py-12">
                <div className="w-16 h-16 rounded-2xl bg-indigo-100 flex items-center justify-center text-3xl">
                  🤖
                </div>
                <div>
                  <p className="text-zinc-900 font-semibold text-lg">Como posso ajudar?</p>
                  <p className="text-zinc-500 text-sm mt-1">Faça perguntas sobre seus dados em linguagem natural.</p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center max-w-xl">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="text-xs border border-zinc-200 rounded-full px-4 py-2 text-zinc-600 hover:bg-zinc-100 hover:border-zinc-300 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'user' ? (
                  <div className="max-w-[70%] rounded-2xl rounded-tr-sm bg-indigo-600 px-4 py-3 text-sm text-white shadow-sm">
                    {msg.content}
                  </div>
                ) : (
                  <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-white border border-zinc-200 px-4 py-3 shadow-sm">
                    <AgentResponseBlock res={msg.content} />
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-tl-sm bg-white border border-zinc-200 px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-zinc-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  ⚠️ {error}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="mt-4 flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
              placeholder="Pergunte sobre seus dados… (Enter para enviar, Shift+Enter para nova linha)"
              rows={1}
              className="flex-1 resize-none rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50 shadow-sm"
              style={{ maxHeight: '160px', overflowY: 'auto' }}
              onInput={(e) => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = Math.min(el.scrollHeight, 160) + 'px'
              }}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={loading || !input.trim()}
              className="h-11 w-11 rounded-2xl bg-indigo-600 flex items-center justify-center text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm flex-shrink-0"
              aria-label="Enviar"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  )
}
