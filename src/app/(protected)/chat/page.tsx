'use client'

import React from 'react'
import { useEffect, useRef, useState, useCallback } from 'react'
import ContasCards from '@/components/clientes/ContasCards'
import type { ContaPainelVinculada } from '@/lib/clientes'
import type { AplicativoRow } from '@/lib/aplicativos'
import type { PagamentoFullRow } from '@/lib/pagamentos'
import EditAssinaturaModal from '@/components/assinaturas/EditAssinaturaModal'
import EditClienteModal from '@/components/clientes/EditClienteModal'
import NovoClienteModal from '@/components/clientes/NovoClienteModal'
import VincularClienteModal from '@/components/clientes/VincularClienteModal'
import type { PlanoRow } from '@/lib/planos'
import type { PacoteRow } from '@/lib/pacotes'

interface Conversa {
  telefone: string
  nome_contato: string | null
  id_cliente: number | null
  nome_cliente: string | null
  foto_url: string | null
  ultima_mensagem_em: string
  ultima_mensagem: string | null
  ultimo_tipo: string | null
  nao_lidas: number
}

interface Mensagem {
  id: number
  wa_msg_id: string
  telefone: string
  nome_contato: string | null
  tipo: string
  conteudo: string | null
  media_mime: string | null
  nome_arquivo: string | null
  origem: 'cliente' | 'jonas' | 'ia'
  sugestao_ia: string | null
  foi_aceita: boolean | null
  mensagem_final: string | null
  reply_to_wa_msg_id: string | null
  reply_to_conteudo: string | null
  reply_to_origem: string | null
  reacao: string | null
  status: string | null
  source: string | null
  recebida_em: string
}

interface Cliente {
  id_cliente: number
  nome: string
  observacao: string | null
  score_fidelidade: number | null
  id_assinatura: number | null
  id_plano: number | null
  id_pacote: number | null
  identificacao: string | null
  assinatura_observacao: string | null
  plano: string | null
  pacote: string | null
  status: string | null
  venc_contrato: string | null
  venc_contas: string | null
  valor: number | null
  servidor: string | null
}

interface AssinaturaResumo {
  id_assinatura: number | null
  id_plano: number | null
  id_pacote: number | null
  plano: string | null
  pacote: string | null
  status: string | null
  venc_contrato: string | null
  venc_contas: string | null
  valor: number | null
}

function formatTel(tel: string) {
  const d = tel.replace(/\D/g, '')
  if (d.length === 13) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  if (d.length === 12) return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`
  return tel
}

function formatHora(iso: string) {
  const d = new Date(iso)
  const hoje = new Date()
  const diff = hoje.getTime() - d.getTime()
  if (diff < 86400000 && d.getDate() === hoje.getDate())
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (diff < 604800000)
    return d.toLocaleDateString('pt-BR', { weekday: 'short' })
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function formatData(iso: string) {
  return iso.split('T')[0].split('-').reverse().join('/')
}

function formatValor(v: number | null) {
  if (!v) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function statusColor(s: string | null) {
  const map: Record<string, string> = {
    ativo: '#22c55e', atrasado: '#f59e0b', vencido: '#ef4444',
    inativo: '#6b7280', pendente: '#3b82f6', cancelado: '#6b7280'
  }
  return map[s ?? ''] ?? '#6b7280'
}

function scoreStars(score: number | null) {
  const n = Math.min(5, Math.max(0, Math.round((score ?? 0) / 20)))
  return '★'.repeat(n) + '☆'.repeat(5 - n)
}

function sourceLabel(source: string | null) {
  if (!source) return null
  if (source.startsWith('chat:')) return { icon: '💬', text: source.slice(5) }
  if (source === 'chat') return { icon: '💬', text: 'Chat' }
  if (source === 'n8n' || source.startsWith('n8n:')) return { icon: '🤖', text: 'Automação' }
  if (source === 'phone') return { icon: '📱', text: 'Celular' }
  return { icon: '💬', text: source }
}

const AVATAR_COLORS = [
  '#E53935', '#D81B60', '#8E24AA', '#5E35B1',
  '#1E88E5', '#00897B', '#43A047', '#FB8C00',
  '#F4511E', '#6D4C41', '#546E7A', '#039BE5',
]

function avatarColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

function nomeInicial(nome: string | null, tel: string) {
  const n = nome ?? formatTel(tel)
  return n.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase()
}

function Avatar({
  fotoUrl, nome, tel, size
}: {
  fotoUrl?: string | null
  nome: string | null
  tel: string
  size: number
}) {
  const label = nome ?? formatTel(tel)
  const bg    = avatarColor(label)
  const ini   = nomeInicial(nome, tel)

  if (fotoUrl) {
    return (
      <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden' }}>
        <img
          src={fotoUrl}
          alt={label}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={e => {
            const el = e.currentTarget
            el.style.display = 'none'
            el.parentElement!.style.background = bg
            el.parentElement!.style.display = 'flex'
            el.parentElement!.style.alignItems = 'center'
            el.parentElement!.style.justifyContent = 'center'
            el.parentElement!.innerHTML = `<span style="color:#fff;font-size:${Math.round(size * 0.38)}px;font-weight:700">${ini}</span>`
          }}
        />
      </div>
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.38), fontWeight: 700, color: '#fff'
    }}>
      {ini}
    </div>
  )
}

const QUICK_EMOJIS = ['👍', '🤝', '🙌', '😅', '🙏', '😉']

const MORE_EMOJIS = [
  '😂','🥰','😊','😎','🤣','😮','😢','😡',
  '🥳','😇','💪','👏','🤦','🫶','❤️','🔥',
  '💯','🎉','💀','🤔','👀','😴','😜','🙄',
  '🫡','😬','🥹','🫠','🤯','🎶','👋','✨',
]

function QuickEmojiStrip({ side, onPick, showLib, onOpenLib }: {
  side: 'left' | 'right'
  onPick: (e: string) => void
  showLib: boolean
  onOpenLib: () => void
}) {
  const mkBtn = (e: string, handler: () => void, extraStyle?: React.CSSProperties) => (
    <button key={e}
      onMouseDown={ev => { ev.preventDefault(); ev.stopPropagation(); handler() }}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: 18, padding: '4px 6px', borderRadius: 8, lineHeight: 1,
        transition: 'background 0.1s', ...extraStyle,
      }}
      onMouseEnter={ev => (ev.currentTarget.style.background = '#f0f2f5')}
      onMouseLeave={ev => (ev.currentTarget.style.background = 'none')}
    >{e}</button>
  )

  return (
    <div style={{
      position: 'absolute', bottom: '100%', marginBottom: 4,
      [side === 'left' ? 'left' : 'right']: 0,
      background: '#fff', borderRadius: showLib ? 12 : 20,
      boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
      border: '1px solid #e9edef',
      padding: showLib ? 8 : '4px 2px',
      zIndex: 60,
    }}>
      {showLib ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2 }}>
          {MORE_EMOJIS.map(e => mkBtn(e, () => onPick(e)))}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {QUICK_EMOJIS.map(e => mkBtn(e, () => onPick(e), { borderRadius: 12 }))}
          <button
            onMouseDown={ev => { ev.preventDefault(); ev.stopPropagation(); onOpenLib() }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 700, color: '#667781',
              padding: '4px 6px', borderRadius: 8, lineHeight: 1,
              borderTop: '1px solid #f0f2f5', marginTop: 1,
            }}
            onMouseEnter={ev => (ev.currentTarget.style.background = '#f0f2f5')}
            onMouseLeave={ev => (ev.currentTarget.style.background = 'none')}
          >＋</button>
        </div>
      )}
    </div>
  )
}

function MsgMenu({ msg, isCliente, side, onReply, onForward, onDelete }: {
  msg: Mensagem; isCliente: boolean; side: 'left' | 'right'
  onReply: () => void; onForward: () => void; onDelete: () => void
}) {
  const item = (icon: string, label: string, onClick: () => void, danger = false) => (
    <button key={label} onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8, width: '100%',
      background: 'none', border: 'none', padding: '8px 14px', cursor: 'pointer',
      fontSize: 13, color: danger ? '#E53935' : '#111b21', textAlign: 'left',
      whiteSpace: 'nowrap'
    }}>
      <span style={{ fontSize: 15 }}>{icon}</span> {label}
    </button>
  )
  return (
    <div style={{
      position: 'absolute', bottom: 32, [side === 'left' ? 'left' : 'right']: 0,
      background: '#fff', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
      border: '1px solid #e9edef', zIndex: 50, overflow: 'hidden', minWidth: 160
    }}>
      {item('↩️', 'Responder', onReply)}
      {item('↗️', 'Encaminhar', onForward)}
      {!isCliente && item('🗑️', 'Apagar', onDelete, true)}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '7px 0', borderBottom: '1px solid #e9edef'
    }}>
      <span style={{ color: '#667781', fontSize: 13 }}>{label}</span>
      <span style={{ color: '#111b21', fontSize: 13, fontWeight: 500, textAlign: 'right' }}>
        {value}
      </span>
    </div>
  )
}

interface RespostaRapida {
  id: number
  atalho: string
  titulo: string
  texto: string
  ordem: number
  ativo: boolean
}

function PagamentoLinha({ p, destaque }: { p: PagamentoFullRow; destaque?: boolean }) {
  const data = p.data_pgto ? p.data_pgto.split('T')[0].split('-').reverse().join('/') : '—'
  const valor = p.valor
    ? Number(p.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    : '—'
  const ok = (p.detalhes ?? '').toUpperCase() === 'OK'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: destaque ? '5px 8px' : '4px 8px',
      marginBottom: 3,
      background: destaque ? '#f0fdf4' : '#f8f9fa',
      border: `1px solid ${destaque ? '#bbf7d0' : '#e9edef'}`,
      borderRadius: 6, fontSize: 11,
    }}>
      <span style={{ color: '#667781', flexShrink: 0 }}>{data}</span>
      <span style={{ color: '#111b21', fontWeight: 600, flexShrink: 0 }}>{valor}</span>
      {p.forma && (
        <span style={{ color: '#54656f', flexShrink: 0 }}>{p.forma}</span>
      )}
      {p.tipo_pagamento && (
        <span style={{
          color: '#667781', fontSize: 10, background: '#f0f2f5',
          borderRadius: 4, padding: '1px 5px', flexShrink: 0
        }}>{p.tipo_pagamento}</span>
      )}
      <span style={{
        marginLeft: 'auto', flexShrink: 0,
        color: ok ? '#16a34a' : '#adbac1', fontWeight: 700, fontSize: 11
      }}>
        {ok ? '✓' : p.detalhes ?? ''}
      </span>
    </div>
  )
}

export default function ChatPage() {
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [filtro, setFiltro] = useState('')
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [sugestao, setSugestao] = useState('')
  const [loadingSugestao, setLoadingSugestao] = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [hoveredMsg, setHoveredMsg] = useState<number | null>(null)
  const [activeMenu, setActiveMenu] = useState<number | null>(null)
  const [hoverMenuMsg, setHoverMenuMsg] = useState<number | null>(null)
  const [replyTo, setReplyTo] = useState<Mensagem | null>(null)
  const [forwardMsg, setForwardMsg] = useState<Mensagem | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [contas, setContas] = useState<ContaPainelVinculada[]>([])
  const [aplicativos, setAplicativos] = useState<AplicativoRow[]>([])
  const [appsRecolhidos, setAppsRecolhidos] = useState(false)
  const [pagamentos, setPagamentos] = useState<PagamentoFullRow[]>([])
  const [pgtsRecolhidos, setPgtsRecolhidos] = useState(true)
  const [planos, setPlanos] = useState<PlanoRow[]>([])
  const [pacotes, setPacotes] = useState<PacoteRow[]>([])
  const [editAssinaturaOpen, setEditAssinaturaOpen] = useState(false)
  const [editAssinaturaAlvo, setEditAssinaturaAlvo] = useState<AssinaturaResumo | null>(null)
  const [assinaturas, setAssinaturas] = useState<AssinaturaResumo[]>([])
  const [outrasRecolhidas, setOutrasRecolhidas] = useState(false)
  const [expandidasAssinaturas, setExpandidasAssinaturas] = useState<Set<number>>(new Set())
  const [editClienteOpen, setEditClienteOpen] = useState(false)
  const [novoClienteOpen, setNovoClienteOpen] = useState(false)
  const [vincularClienteOpen, setVincularClienteOpen] = useState(false)
  const [emojiLibMsg, setEmojiLibMsg] = useState<number | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [qrOpen, setQrOpen] = useState(false)
  const [qrFiltro, setQrFiltro] = useState('')
  const [qrIdx, setQrIdx] = useState(0)
  const [respostasRapidas, setRespostasRapidas] = useState<RespostaRapida[]>([])
  const [configOpen, setConfigOpen] = useState(false)
  const [rrEditando, setRrEditando] = useState<RespostaRapida | null>(null)
  const [rrNovo, setRrNovo] = useState(false)
  const [rrForm, setRrForm] = useState({ atalho: '', titulo: '', texto: '', ordem: 0 })
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const prevMsgCountRef = useRef(0)
  const hoverLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mensagensAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => { if (hoverLeaveTimer.current) clearTimeout(hoverLeaveTimer.current) }
  }, [])

  const carregarConversas = useCallback(async () => {
    if (document.visibilityState === 'hidden') return
    const res = await fetch('/api/whatsapp/conversas')
    if (res.ok) setConversas(await res.json())
  }, [])

  useEffect(() => {
    carregarConversas()
    const interval = setInterval(carregarConversas, 10000)
    const onVisible = () => { if (document.visibilityState === 'visible') carregarConversas() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible) }
  }, [carregarConversas])

  useEffect(() => {
    fetch('/api/assinaturas/opcoes')
      .then(r => r.ok ? r.json() : { planos: [], pacotes: [] })
      .then(d => { setPlanos(d.planos); setPacotes(d.pacotes) })
      .catch(() => {})
  }, [])

  const carregarMensagens = useCallback(async (tel: string, ignorarVisibilidade = false) => {
    if (!ignorarVisibilidade && document.visibilityState === 'hidden') return
    mensagensAbortRef.current?.abort()
    const controller = new AbortController()
    mensagensAbortRef.current = controller
    if (ignorarVisibilidade) setLoadingMsgs(true)
    try {
      const res = await fetch(`/api/whatsapp/mensagens?telefone=${tel}`, { signal: controller.signal })
      if (res.ok) {
        const data = await res.json()
        setMensagens(data.mensagens)
        setCliente(data.cliente)
        setAssinaturas(data.assinaturas ?? [])
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
    } finally {
      setLoadingMsgs(false)
    }
  }, [])

  useEffect(() => {
    if (!selecionado) return
    carregarMensagens(selecionado, true)
    const interval = setInterval(() => carregarMensagens(selecionado), 5000)
    const onVisible = () => { if (document.visibilityState === 'visible') carregarMensagens(selecionado, true) }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible) }
  }, [selecionado, carregarMensagens])

  useEffect(() => {
    if (mensagens.length > prevMsgCountRef.current) {
      const isInitial = prevMsgCountRef.current === 0
      bottomRef.current?.scrollIntoView({ behavior: isInitial ? 'instant' : 'smooth' })
    }
    prevMsgCountRef.current = mensagens.length
  }, [mensagens])

  // Limpa modo de seleção e outros estados transientes ao trocar de conversa
  useEffect(() => {
    setSelectMode(false)
    setSelectedIds(new Set())
    setReplyTo(null)
    setSugestao('')
    setActiveMenu(null)
    setHoverMenuMsg(null)
    setHoveredMsg(null)
    setEmojiLibMsg(null)
    setCopiedId(null)
    setQrOpen(false)
    setQrFiltro('')
    setAssinaturas([])
    setOutrasRecolhidas(false)
    setExpandidasAssinaturas(new Set())
    prevMsgCountRef.current = 0
  }, [selecionado])

  useEffect(() => {
    fetch('/api/whatsapp/respostas-rapidas')
      .then(r => r.ok ? r.json() : [])
      .then((rows: RespostaRapida[]) => setRespostasRapidas(rows.filter(r => r.ativo)))
      .catch(() => {})
  }, [])

  async function carregarRR() {
    const r = await fetch('/api/whatsapp/respostas-rapidas')
    if (r.ok) {
      const rows: RespostaRapida[] = await r.json()
      setRespostasRapidas(rows.filter(r => r.ativo))
    }
  }

  async function salvarRR() {
    if (!rrForm.atalho.trim() || !rrForm.titulo.trim() || !rrForm.texto.trim()) return
    if (rrEditando) {
      await fetch(`/api/whatsapp/respostas-rapidas/${rrEditando.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...rrEditando, ...rrForm }),
      })
      setRrEditando(null)
    } else {
      await fetch('/api/whatsapp/respostas-rapidas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rrForm),
      })
      setRrNovo(false)
    }
    setRrForm({ atalho: '', titulo: '', texto: '', ordem: 0 })
    carregarRR()
  }

  async function deletarRR(id: number) {
    await fetch(`/api/whatsapp/respostas-rapidas/${id}`, { method: 'DELETE' })
    carregarRR()
  }

  function aplicarRR(t: string) {
    setTexto(t)
    setQrOpen(false)
    setQrFiltro('')
    setQrIdx(0)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  // Carrega contas e aplicativos quando cliente é identificado
  useEffect(() => {
    if (!cliente?.id_cliente) { setContas([]); setAplicativos([]); setPagamentos([]); return }
    fetch(`/api/clientes/${cliente.id_cliente}/contas`)
      .then(r => r.ok ? r.json() : [])
      .then(setContas)
      .catch(() => setContas([]))
    fetch(`/api/clientes/${cliente.id_cliente}/aplicativos`)
      .then(r => r.ok ? r.json() : [])
      .then(setAplicativos)
      .catch(() => setAplicativos([]))
    fetch(`/api/clientes/${cliente.id_cliente}/pagamentos`)
      .then(r => r.ok ? r.json() : [])
      .then(setPagamentos)
      .catch(() => setPagamentos([]))
  }, [cliente?.id_cliente])

  async function gerarSugestao() {
    if (!selecionado || mensagens.length === 0) return
    setLoadingSugestao(true)
    setSugestao('')
    try {
      const historico = mensagens.slice(-10).map(m =>
        `${m.origem === 'cliente' ? 'Cliente' : 'Jonas'}: ${m.conteudo ?? '[mídia]'}`
      ).join('\n')
      const res = await fetch('/api/ia/sugestao-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          historico,
          cliente: cliente ? {
            nome: cliente.nome,
            plano: cliente.plano,
            status: cliente.status,
            vencimento: cliente.venc_contas
          } : null
        })
      })
      if (res.ok) {
        const data = await res.json()
        setSugestao(data.sugestao ?? '')
        setTexto(data.sugestao ?? '')
      }
    } finally {
      setLoadingSugestao(false)
    }
  }

  async function enviar(usouSugestao = false) {
    if (!texto.trim() || !selecionado || enviando) return
    setEnviando(true)
    const msgFinal     = texto.trim()
    const replyId      = replyTo?.wa_msg_id ?? null
    const replyConteudo = replyTo ? (replyTo.tipo === 'text' ? (replyTo.conteudo ?? null) : `[${replyTo.tipo}]`) : null
    const replyOrigem  = replyTo?.origem ?? null
    setTexto('')
    setSugestao('')
    setReplyTo(null)
    try {
      await fetch('/api/whatsapp/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telefone: selecionado,
          mensagem: msgFinal,
          sugestao_ia: usouSugestao ? sugestao : null,
          foi_aceita: usouSugestao ? true : null,
          reply_msg_id: replyId,
          reply_conteudo: replyConteudo,
          reply_origem: replyOrigem,
        })
      })
      await carregarMensagens(selecionado)
    } finally {
      setEnviando(false)
      inputRef.current?.focus()
    }
  }

  async function reagir(msg: Mensagem, emoji: string) {
    setActiveMenu(null)
    setHoverMenuMsg(null)
    setEmojiLibMsg(null)
    if (!selecionado) return
    const reacaoAnterior = msg.reacao
    setMensagens(prev => prev.map(m => m.id === msg.id ? { ...m, reacao: emoji } : m))
    try {
      const res = await fetch('/api/whatsapp/reagir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefone: selecionado, wa_msg_id: msg.wa_msg_id, emoji }),
      })
      if (!res.ok) throw new Error('falha')
    } catch {
      setMensagens(prev => prev.map(m => m.id === msg.id ? { ...m, reacao: reacaoAnterior } : m))
    }
  }

  function iniciarSelecao(msg: Mensagem) {
    setActiveMenu(null)
    setSelectMode(true)
    setSelectedIds(new Set([msg.id]))
  }

  function toggleSelecao(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function cancelarSelecao() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  async function apagarSelecionados() {
    if (!selecionado || selectedIds.size === 0) return
    const alvos = mensagens.filter(m => selectedIds.has(m.id))
    cancelarSelecao()
    await Promise.all(alvos.map(m =>
      fetch('/api/whatsapp/apagar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefone: selecionado, wa_msg_id: m.wa_msg_id }),
      })
    ))
    await carregarMensagens(selecionado)
  }

  async function encaminhar(msg: Mensagem, destTelefone: string) {
    setForwardMsg(null)
    await fetch('/api/whatsapp/enviar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefone: destTelefone, mensagem: msg.conteudo ?? '' }),
    })
  }

  function fecharMenus() {
    setActiveMenu(null)
    setHoverMenuMsg(null)
    setEmojiLibMsg(null)
  }

  const conversasFiltradas = conversas.filter(c => {
    const q = filtro.toLowerCase()
    return (
      (c.nome_contato ?? '').toLowerCase().includes(q) ||
      (c.nome_cliente ?? '').toLowerCase().includes(q) ||
      c.telefone.includes(q)
    )
  })

  const conversaAtual = conversas.find(c => c.telefone === selecionado)
  const nomeExibido = conversaAtual?.nome_cliente ?? conversaAtual?.nome_contato ?? (selecionado ? formatTel(selecionado) : '')

  return (
    <div style={{
      display: 'flex', height: '100vh', background: '#f0f2f5',
      fontFamily: "'Segoe UI', system-ui, sans-serif", overflow: 'hidden'
    }}>

      {/* ── Painel esquerdo ── */}
      <div style={{
        width: 360, minWidth: 300, display: 'flex', flexDirection: 'column',
        borderRight: '1px solid #d1d7db', background: '#ffffff'
      }}>

        {/* Header esquerdo */}
        <div style={{
          padding: '10px 16px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', background: '#f0f2f5',
          borderBottom: '1px solid #e9edef'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%', background: '#00a884',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, fontWeight: 700, color: '#fff'
            }}>JS</div>
            <span style={{ color: '#111b21', fontWeight: 600, fontSize: 16 }}>Atendimento</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#667781', fontSize: 12 }}>{conversas.length} conv.</span>
            <button
              onClick={() => setConfigOpen(o => !o)}
              title="Configurações"
              style={{
                background: configOpen ? '#e8fce4' : '#e9edef',
                border: `1px solid ${configOpen ? '#00a884' : '#d1d7db'}`,
                color: configOpen ? '#00a884' : '#667781',
                borderRadius: 6, padding: '4px 7px', cursor: 'pointer',
                fontSize: 15, lineHeight: 1, display: 'flex', alignItems: 'center'
              }}
            >⚙</button>
            <a
              href="/dashboard"
              style={{
                color: '#667781', fontSize: 12, textDecoration: 'none',
                background: '#e9edef', borderRadius: 6, padding: '4px 8px',
                border: '1px solid #d1d7db'
              }}
            >← Voltar</a>
          </div>
        </div>

        {configOpen ? (
          /* ── Painel de configurações ── */
          <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
            {/* Respostas Rápidas */}
            <div style={{ padding: '14px 16px 8px', borderBottom: '1px solid #e9edef' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: '#111b21' }}>Respostas Rápidas</span>
                <button
                  onClick={() => { setRrNovo(true); setRrEditando(null); setRrForm({ atalho: '', titulo: '', texto: '', ordem: 0 }) }}
                  style={{ background: '#e8fce4', border: '1px solid #00a884', color: '#00a884', borderRadius: 6, padding: '3px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                >+ Nova</button>
              </div>

              {(rrNovo || rrEditando) && (
                <div style={{ background: '#f8f9fa', border: '1px solid #e9edef', borderRadius: 8, padding: 12, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      placeholder="atalho"
                      value={rrForm.atalho}
                      onChange={e => setRrForm(f => ({ ...f, atalho: e.target.value }))}
                      style={{ width: 80, background: '#fff', border: '1px solid #d1d7db', borderRadius: 5, padding: '4px 8px', fontSize: 12, outline: 'none' }}
                    />
                    <input
                      placeholder="título"
                      value={rrForm.titulo}
                      onChange={e => setRrForm(f => ({ ...f, titulo: e.target.value }))}
                      style={{ flex: 1, background: '#fff', border: '1px solid #d1d7db', borderRadius: 5, padding: '4px 8px', fontSize: 12, outline: 'none' }}
                    />
                    <input
                      placeholder="ordem"
                      type="number"
                      value={rrForm.ordem}
                      onChange={e => setRrForm(f => ({ ...f, ordem: Number(e.target.value) }))}
                      style={{ width: 52, background: '#fff', border: '1px solid #d1d7db', borderRadius: 5, padding: '4px 6px', fontSize: 12, outline: 'none' }}
                    />
                  </div>
                  <textarea
                    placeholder="texto da resposta"
                    value={rrForm.texto}
                    onChange={e => setRrForm(f => ({ ...f, texto: e.target.value }))}
                    rows={2}
                    style={{ background: '#fff', border: '1px solid #d1d7db', borderRadius: 5, padding: '4px 8px', fontSize: 12, outline: 'none', resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => { setRrNovo(false); setRrEditando(null); setRrForm({ atalho: '', titulo: '', texto: '', ordem: 0 }) }}
                      style={{ background: '#e9edef', border: 'none', borderRadius: 5, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}
                    >Cancelar</button>
                    <button
                      onClick={salvarRR}
                      style={{ background: '#00a884', border: 'none', color: '#fff', borderRadius: 5, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}
                    >Salvar</button>
                  </div>
                </div>
              )}

              {respostasRapidas.length === 0 && !rrNovo && (
                <div style={{ color: '#adbac1', fontSize: 12, padding: '8px 0' }}>Nenhuma resposta cadastrada.</div>
              )}

              {respostasRapidas.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <span style={{ color: '#00a884', fontWeight: 700, fontSize: 11, background: '#e8fce4', borderRadius: 4, padding: '1px 5px', flexShrink: 0, marginTop: 2 }}>/{r.atalho}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 12, color: '#111b21' }}>{r.titulo}</div>
                    <div style={{ fontSize: 11, color: '#667781', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.texto}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={() => { setRrEditando(r); setRrNovo(false); setRrForm({ atalho: r.atalho, titulo: r.titulo, texto: r.texto, ordem: r.ordem }) }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#667781', padding: '2px 4px', borderRadius: 4 }}
                    >✏️</button>
                    <button
                      onClick={() => deletarRR(r.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#E53935', padding: '2px 4px', borderRadius: 4 }}
                    >🗑️</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
        <>
        {/* Busca */}
        <div style={{ padding: '8px 12px', background: '#f0f2f5', borderBottom: '1px solid #e9edef' }}>
          <div style={{
            background: '#ffffff', borderRadius: 8, padding: '8px 14px',
            display: 'flex', alignItems: 'center', gap: 8,
            border: '1px solid #e9edef'
          }}>
            <span style={{ color: '#adbac1', fontSize: 16 }}>🔍</span>
            <input
              value={filtro}
              onChange={e => setFiltro(e.target.value)}
              placeholder="Buscar conversa..."
              style={{
                background: 'transparent', border: 'none', outline: 'none',
                color: '#111b21', fontSize: 14, width: '100%'
              }}
            />
          </div>
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto', background: '#ffffff' }}>
          {conversasFiltradas.map(conv => {
            const ativo = conv.telefone === selecionado
            const nome = conv.nome_cliente ?? conv.nome_contato ?? formatTel(conv.telefone)
            const preview = conv.ultimo_tipo === 'audio' ? '🎵 Áudio'
              : conv.ultimo_tipo === 'image' ? '📷 Imagem'
              : conv.ultimo_tipo === 'video' ? '🎥 Vídeo'
              : conv.ultimo_tipo === 'document' ? '📄 Documento'
              : conv.ultimo_tipo === 'template' ? '📋 Template'
              : conv.ultimo_tipo === 'pix' ? '🏦 Chave PIX'
              : conv.ultimo_tipo === 'interactive_reply' ? '🔘 Resposta rápida'
              : (conv.ultima_mensagem ?? '')

            return (
              <div
                key={conv.telefone}
                onClick={() => {
                  setSelecionado(conv.telefone)
                  if (conv.nao_lidas > 0) {
                    setConversas(prev => prev.map(c =>
                      c.telefone === conv.telefone ? { ...c, nao_lidas: 0 } : c
                    ))
                    fetch('/api/whatsapp/marcar-lida', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ telefone: conv.telefone }),
                    }).catch(() => {})
                  }
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  cursor: 'pointer', borderBottom: '1px solid #f0f2f5',
                  background: ativo ? '#f0f2f5' : 'transparent',
                  transition: 'background 0.1s'
                }}
              >
                <Avatar
                  fotoUrl={conv.foto_url}
                  nome={nome}
                  tel={conv.telefone}
                  size={46}
                  />

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      color: '#111b21', fontWeight: 600, fontSize: 15,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      maxWidth: 180
                    }}>{nome}</span>
                    <span style={{ color: '#667781', fontSize: 11, flexShrink: 0, marginLeft: 8 }}>
                      {formatHora(conv.ultima_mensagem_em)}
                    </span>
                  </div>
                  {conv.nome_cliente && conv.nome_contato && conv.nome_cliente !== conv.nome_contato && (
                    <div style={{
                      color: '#adbac1', fontSize: 11,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      lineHeight: 1.3
                    }}>{conv.nome_contato}</div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                    <span style={{
                      color: '#667781', fontSize: 13,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      maxWidth: 200
                    }}>{preview}</span>
                    {conv.nao_lidas > 0 && (
                      <span style={{
                        background: '#00a884', color: '#fff', fontSize: 11, fontWeight: 700,
                        borderRadius: 10, padding: '1px 6px', flexShrink: 0, marginLeft: 6
                      }}>{conv.nao_lidas}</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {conversasFiltradas.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: '#667781', fontSize: 14 }}>
              Nenhuma conversa encontrada
            </div>
          )}
        </div>
        </>
        )}
      </div>

      {/* ── Painel central: chat ── */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        background: '#efeae2', position: 'relative', overflow: 'hidden'
      }}>
        {!selecionado ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', color: '#667781',
            background: '#f8f9fa'
          }}>
            <div style={{ fontSize: 64, marginBottom: 16 }}>💬</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#3b4a54' }}>JS Sistemas — Atendimento</div>
            <div style={{ fontSize: 14, marginTop: 8 }}>Selecione uma conversa para começar</div>
          </div>
        ) : (
          <>
            {/* Header do chat */}
            <div style={{
              background: '#f0f2f5', padding: '10px 20px',
              display: 'flex', alignItems: 'center', gap: 12,
              borderBottom: '1px solid #d1d7db'
            }}>
              <Avatar
                fotoUrl={conversaAtual?.foto_url}
                nome={nomeExibido}
                tel={selecionado}
                size={40}
              />
              <div>
                <div style={{ color: '#111b21', fontWeight: 600, fontSize: 15 }}>{nomeExibido}</div>
                <div style={{ color: '#667781', fontSize: 12 }}>{formatTel(selecionado)}</div>
                {conversaAtual?.nome_cliente && conversaAtual.nome_contato && conversaAtual.nome_cliente !== conversaAtual.nome_contato && (
                  <div style={{ color: '#adbac1', fontSize: 11 }}>{conversaAtual.nome_contato}</div>
                )}
              </div>
            </div>

            {/* Mensagens */}
            <div style={{
              flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 20px',
              display: 'flex', flexDirection: 'column', gap: 4
            }}>
              {loadingMsgs && mensagens.length === 0 && (
                <div style={{ textAlign: 'center', color: '#667781', marginTop: 40 }}>Carregando...</div>
              )}

              {mensagens.map((msg, i) => {
                const isCliente = msg.origem === 'cliente'
                const showData  = i === 0 ||
                  new Date(msg.recebida_em).toDateString() !==
                  new Date(mensagens[i - 1].recebida_em).toDateString()
                const isSelected = selectedIds.has(msg.id)

                return (
                  <div key={msg.id}>
                    {showData && (
                      <div style={{ textAlign: 'center', margin: '12px 0 8px' }}>
                        <span style={{
                          background: 'rgba(255,255,255,0.88)', color: '#54656f', fontSize: 12,
                          padding: '4px 12px', borderRadius: 8,
                          boxShadow: '0 1px 2px rgba(0,0,0,0.08)'
                        }}>
                          {new Date(msg.recebida_em).toLocaleDateString('pt-BR', {
                            weekday: 'long', day: '2-digit', month: 'long'
                          })}
                        </span>
                      </div>
                    )}

                    <div
                      style={{
                        display: 'flex', justifyContent: isCliente ? 'flex-start' : 'flex-end',
                        marginBottom: msg.reacao ? 14 : 2, alignItems: 'flex-end', gap: 4,
                        ...(selectMode ? { cursor: 'pointer', padding: '2px 0', borderRadius: 6, background: isSelected ? 'rgba(0,168,132,0.08)' : 'transparent' } : {})
                      }}
                      onMouseEnter={() => !selectMode && setHoveredMsg(msg.id)}
                      onMouseLeave={() => { if (activeMenu !== msg.id) setHoveredMsg(null) }}
                      onClick={() => selectMode && toggleSelecao(msg.id)}
                    >
                      {/* Checkbox no modo de seleção */}
                      {selectMode && (
                        <div style={{
                          width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                          border: `2px solid ${isSelected ? '#00a884' : '#adbac1'}`,
                          background: isSelected ? '#00a884' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          order: isCliente ? -1 : 1, marginLeft: isCliente ? 0 : 8, marginRight: isCliente ? 8 : 0,
                          transition: 'all 0.15s'
                        }}>
                          {isSelected && <span style={{ color: '#fff', fontSize: 13, lineHeight: 1 }}>✓</span>}
                        </div>
                      )}
                      {/* Botão de ação — lado esquerdo para mensagens enviadas */}
                      {!selectMode && !isCliente && (hoveredMsg === msg.id || activeMenu === msg.id || hoverMenuMsg === msg.id || emojiLibMsg === msg.id) && (
                        <div
                          style={{ position: 'relative', flexShrink: 0 }}
                          onMouseEnter={() => { if (hoverLeaveTimer.current) { clearTimeout(hoverLeaveTimer.current); hoverLeaveTimer.current = null } setHoverMenuMsg(msg.id) }}
                          onMouseLeave={() => { hoverLeaveTimer.current = setTimeout(() => setHoverMenuMsg(null), 200) }}
                        >
                          {(hoverMenuMsg === msg.id || emojiLibMsg === msg.id) && !activeMenu && (
                            <QuickEmojiStrip side="left" onPick={e => reagir(msg, e)} showLib={emojiLibMsg === msg.id} onOpenLib={() => setEmojiLibMsg(msg.id)} />
                          )}
                          <button
                            onClick={() => setActiveMenu(activeMenu === msg.id ? null : msg.id)}
                            style={{
                              background: 'rgba(255,255,255,0.85)', border: '1px solid #d1d7db',
                              borderRadius: '50%', width: 26, height: 26, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 13, color: '#54656f', boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                            }}
                          >▾</button>
                          {activeMenu === msg.id && <MsgMenu msg={msg} isCliente={isCliente} side="left" onReply={() => { setReplyTo(msg); setActiveMenu(null); inputRef.current?.focus() }} onForward={() => { setForwardMsg(msg); setActiveMenu(null) }} onDelete={() => iniciarSelecao(msg)} />}
                        </div>
                      )}

                      <div style={{ position: 'relative', maxWidth: '65%' }}>
                      <div style={{
                        padding: '8px 12px',
                        borderRadius: isCliente ? '0 8px 8px 8px' : '8px 0 8px 8px',
                        background: isCliente ? '#ffffff' : '#d9fdd3',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.13)'
                      }}>
                        {/* Quote de resposta */}
                        {msg.reply_to_wa_msg_id && (
                          <div style={{
                            background: isCliente ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.07)',
                            borderLeft: '3px solid #00a884',
                            borderRadius: '0 4px 4px 0',
                            padding: '5px 8px',
                            marginBottom: 6,
                            overflow: 'hidden',
                          }}>
                            <div style={{ color: '#00a884', fontSize: 11, fontWeight: 700, marginBottom: 2 }}>
                              {msg.reply_to_origem === 'jonas' ? 'Você' : (conversaAtual?.nome_cliente ?? conversaAtual?.nome_contato ?? 'Cliente')}
                            </div>
                            <div style={{
                              color: '#667781', fontSize: 12,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                            }}>
                              {msg.reply_to_conteudo ?? '— mensagem não disponível —'}
                            </div>
                          </div>
                        )}
                        {msg.tipo === 'text' && (
                          <div style={{ color: '#111b21', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                            {msg.conteudo}
                          </div>
                        )}
                        {msg.tipo === 'audio' && msg.conteudo && (
                          <audio
                            controls
                            src={`/api/whatsapp/media?id=${msg.conteudo}`}
                            style={{ maxWidth: '100%', height: 36, display: 'block' }}
                          />
                        )}
                        {msg.tipo === 'image' && msg.conteudo && (
                          <img
                            src={`/api/whatsapp/media?id=${msg.conteudo}`}
                            alt="Imagem"
                            onClick={() => setLightbox(`/api/whatsapp/media?id=${msg.conteudo}`)}
                            style={{
                              maxWidth: '100%', maxHeight: 220, borderRadius: 6,
                              display: 'block', cursor: 'zoom-in', objectFit: 'cover'
                            }}
                          />
                        )}
                        {msg.tipo === 'video' && msg.conteudo && (
                          <video
                            controls
                            src={`/api/whatsapp/media?id=${msg.conteudo}`}
                            style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 6, display: 'block' }}
                          />
                        )}
                        {msg.tipo === 'template' && (() => {
                          let data: { name?: string | null; copyCode?: string | null } = {}
                          try { data = JSON.parse(msg.conteudo ?? '{}') } catch {}
                          const code = data.copyCode ?? '40.827.286/0001-06'
                          return (
                            <div style={{ minWidth: 220 }}>
                              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                                <div style={{
                                  width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                                  background: '#128c7e', display: 'flex', alignItems: 'center',
                                  justifyContent: 'center', color: '#fff', fontSize: 18
                                }}>₽</div>
                                <div>
                                  <div style={{ fontWeight: 600, fontSize: 13, color: '#111b21' }}>Js Sistemas - Jonas Eduardo Scheibe</div>
                                  <div style={{ fontSize: 12, color: '#667781' }}>CNPJ: 40.827.286/0001-06</div>
                                </div>
                              </div>
                              <hr style={{ border: 'none', borderTop: '1px solid #e9edef', margin: '0 0 6px 0' }} />
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(code.replace(/\D/g, ''))
                                  setCopiedId(msg.id)
                                  setTimeout(() => setCopiedId(prev => prev === msg.id ? null : prev), 2000)
                                }}
                                style={{
                                  width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                                  color: copiedId === msg.id ? '#128c7e' : '#00a884',
                                  fontSize: 14, fontWeight: 600, padding: '4px 0',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                                }}
                              >
                                {copiedId === msg.id ? '✓ Chave copiada' : '📋 Copiar chave Pix'}
                              </button>
                            </div>
                          )
                        })()}
                        {msg.tipo === 'pix' && (
                          <div style={{ minWidth: 220 }}>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                              <div style={{
                                width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                                background: '#128c7e', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', color: '#fff', fontSize: 18
                              }}>₽</div>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: 13, color: '#111b21' }}>Js Sistemas - Jonas Eduardo Scheibe</div>
                                <div style={{ fontSize: 12, color: '#667781' }}>CNPJ: 40.827.286/0001-06</div>
                              </div>
                            </div>
                            <hr style={{ border: 'none', borderTop: '1px solid #e9edef', margin: '0 0 6px 0' }} />
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText('40827286000106')
                                setCopiedId(msg.id)
                                setTimeout(() => setCopiedId(prev => prev === msg.id ? null : prev), 2000)
                              }}
                              style={{
                                width: '100%', background: 'none', border: 'none', cursor: 'pointer',
                                color: copiedId === msg.id ? '#128c7e' : '#00a884',
                                fontSize: 14, fontWeight: 600, padding: '4px 0',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
                              }}
                            >
                              {copiedId === msg.id ? '✓ Chave copiada' : '📋 Copiar chave Pix'}
                            </button>
                          </div>
                        )}
                        {msg.tipo === 'interactive_reply' && (
                          <div style={{ fontSize: 14, color: '#111b21' }}>
                            <span style={{
                              display: 'inline-block', background: 'rgba(0,168,132,0.12)',
                              color: '#00a884', borderRadius: 12, padding: '3px 12px',
                              fontSize: 13, fontWeight: 600, border: '1px solid rgba(0,168,132,0.3)'
                            }}>
                              🔘 {msg.conteudo}
                            </span>
                          </div>
                        )}
                        {msg.tipo === 'interactive' && (() => {
                          let iv: any = {}
                          try { iv = JSON.parse(msg.conteudo ?? '{}') } catch {}
                          const label = iv.body?.text ?? iv.header?.text ?? '[Mensagem interativa]'
                          return (
                            <div style={{ fontSize: 14, fontStyle: 'italic', color: '#667781' }}>
                              🔘 {label}
                            </div>
                          )
                        })()}
                        {!['text','audio','image','video','document','template','pix','interactive','interactive_reply'].includes(msg.tipo) && (
                          <div style={{ color: '#adbac1', fontSize: 12, fontStyle: 'italic' }}>
                            [{msg.tipo}]
                          </div>
                        )}
                        {msg.tipo === 'document' && msg.conteudo && (() => {
                          const url  = `/api/whatsapp/media?id=${msg.conteudo}`
                          const mime = msg.media_mime ?? ''
                          const nome = msg.nome_arquivo ?? 'documento'
                          const ext  = nome.split('.').pop()?.toUpperCase() ?? ''

                          const extColors: Record<string, string> = {
                            PDF: '#E53935', DOC: '#1E88E5', DOCX: '#1E88E5',
                            XLS: '#43A047', XLSX: '#43A047', PPT: '#FB8C00',
                            PPTX: '#FB8C00', ZIP: '#8E24AA', RAR: '#8E24AA',
                          }
                          const extColor = extColors[ext] ?? '#546E7A'

                          // Imagem enviada como documento
                          if (mime.startsWith('image/')) {
                            return (
                              <img
                                src={url}
                                alt={nome}
                                onClick={() => setLightbox(url)}
                                style={{
                                  maxWidth: '100%', maxHeight: 220, borderRadius: 6,
                                  display: 'block', cursor: 'zoom-in', objectFit: 'cover'
                                }}
                              />
                            )
                          }

                          // PDF com preview inline
                          if (mime === 'application/pdf') {
                            return (
                              <div>
                                <div style={{
                                  width: '100%', height: 180, overflow: 'hidden',
                                  borderRadius: 6, border: '1px solid #e9edef',
                                  position: 'relative', background: '#f8f9fa'
                                }}>
                                  <iframe
                                    src={`${url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                                    style={{ width: '100%', height: 260, border: 'none', marginTop: -40, pointerEvents: 'none' }}
                                    title={nome}
                                  />
                                  <div style={{ position: 'absolute', inset: 0 }} />
                                </div>
                                <a
                                  href={url} target="_blank" rel="noopener noreferrer"
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    marginTop: 6, textDecoration: 'none', fontSize: 12,
                                    color: '#667781'
                                  }}
                                >
                                  <span style={{
                                    background: extColor, color: '#fff', borderRadius: 4,
                                    padding: '2px 5px', fontSize: 10, fontWeight: 700
                                  }}>PDF</span>
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {nome}
                                  </span>
                                </a>
                              </div>
                            )
                          }

                          // Outros tipos — card com ícone de extensão
                          return (
                            <a
                              href={url} target="_blank" rel="noopener noreferrer"
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                textDecoration: 'none', padding: '8px 10px',
                                background: 'rgba(0,0,0,0.04)', borderRadius: 8
                              }}
                            >
                              <div style={{
                                width: 36, height: 36, borderRadius: 6, flexShrink: 0,
                                background: extColor,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: '#fff', fontSize: 10, fontWeight: 700
                              }}>{ext || '?'}</div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{
                                  color: '#111b21', fontSize: 13, fontWeight: 500,
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                }}>{nome}</div>
                                <div style={{ color: '#667781', fontSize: 11, marginTop: 1 }}>
                                  {ext || mime || 'Arquivo'}
                                </div>
                              </div>
                            </a>
                          )
                        })()}

                        <div style={{
                          display: 'flex', justifyContent: 'flex-end',
                          alignItems: 'center', gap: 4, marginTop: 3
                        }}>
                          {msg.foi_aceita && (
                            <span style={{ color: '#00a884', fontSize: 10 }}>✦ IA</span>
                          )}
                          {!isCliente && (() => {
                            const sl = sourceLabel(msg.source)
                            return sl ? (
                              <span style={{ color: '#008069', fontSize: 10 }} title={sl.text}>
                                {sl.icon} {sl.text}
                              </span>
                            ) : null
                          })()}
                          <span style={{ color: '#667781', fontSize: 11 }}>
                            {new Date(msg.recebida_em).toLocaleTimeString('pt-BR', {
                              hour: '2-digit', minute: '2-digit'
                            })}
                          </span>
                          {!isCliente && (
                            <span style={{ color: msg.status === 'read' ? '#53bdeb' : '#667781', fontSize: 13 }}>
                              {msg.status === 'read' ? '✓✓' : msg.status === 'delivered' ? '✓✓' : '✓'}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Badge de reação */}
                      {msg.reacao && (
                        <div style={{
                          position: 'absolute', bottom: -10,
                          [isCliente ? 'left' : 'right']: 8,
                          background: '#fff', borderRadius: 10,
                          padding: '1px 5px', fontSize: 14, lineHeight: 1.3,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                          border: '1px solid rgba(0,0,0,0.06)',
                          zIndex: 1,
                        }}>
                          {msg.reacao}
                        </div>
                      )}
                      </div>

                      {/* Botão de ação — lado direito para mensagens do cliente */}
                      {!selectMode && isCliente && (hoveredMsg === msg.id || activeMenu === msg.id || hoverMenuMsg === msg.id || emojiLibMsg === msg.id) && (
                        <div
                          style={{ position: 'relative', flexShrink: 0 }}
                          onMouseEnter={() => { if (hoverLeaveTimer.current) { clearTimeout(hoverLeaveTimer.current); hoverLeaveTimer.current = null } setHoverMenuMsg(msg.id) }}
                          onMouseLeave={() => { hoverLeaveTimer.current = setTimeout(() => setHoverMenuMsg(null), 200) }}
                        >
                          {(hoverMenuMsg === msg.id || emojiLibMsg === msg.id) && !activeMenu && (
                            <QuickEmojiStrip side="right" onPick={e => reagir(msg, e)} showLib={emojiLibMsg === msg.id} onOpenLib={() => setEmojiLibMsg(msg.id)} />
                          )}
                          <button
                            onClick={() => setActiveMenu(activeMenu === msg.id ? null : msg.id)}
                            style={{
                              background: 'rgba(255,255,255,0.85)', border: '1px solid #d1d7db',
                              borderRadius: '50%', width: 26, height: 26, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 13, color: '#54656f', boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                            }}
                          >▾</button>
                          {activeMenu === msg.id && <MsgMenu msg={msg} isCliente={isCliente} side="right" onReply={() => { setReplyTo(msg); setActiveMenu(null); inputRef.current?.focus() }} onForward={() => { setForwardMsg(msg); setActiveMenu(null) }} onDelete={() => iniciarSelecao(msg)} />}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {/* Sugestão de IA */}
            {sugestao && !selectMode && (
              <div style={{
                background: '#e8fce4', borderTop: '1px solid #00a884',
                padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10
              }}>
                <span style={{ color: '#00a884', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>✦ IA</span>
                <span style={{ color: '#3b4a54', fontSize: 13, flex: 1 }}>{sugestao}</span>
                <button
                  onClick={() => { setTexto(sugestao); inputRef.current?.focus() }}
                  style={{
                    background: '#00a884', color: '#fff', border: 'none',
                    borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer'
                  }}
                >Usar</button>
                <button
                  onClick={() => setSugestao('')}
                  style={{
                    background: 'transparent', color: '#667781', border: 'none',
                    fontSize: 16, cursor: 'pointer', padding: '0 4px'
                  }}
                >✕</button>
              </div>
            )}

            {/* Banner de resposta */}
            {replyTo && !selectMode && (
              <div style={{
                background: '#f0f2f5', borderTop: '1px solid #d1d7db',
                padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 10
              }}>
                <div style={{ flex: 1, borderLeft: '3px solid #00a884', paddingLeft: 8, minWidth: 0 }}>
                  <div style={{ color: '#00a884', fontSize: 12, fontWeight: 600 }}>
                    {replyTo.origem === 'cliente' ? (conversaAtual?.nome_cliente ?? conversaAtual?.nome_contato ?? 'Cliente') : 'Você'}
                  </div>
                  <div style={{ color: '#667781', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {replyTo.tipo === 'text' ? replyTo.conteudo : `[${replyTo.tipo}]`}
                  </div>
                </div>
                <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', color: '#667781', cursor: 'pointer', fontSize: 18 }}>✕</button>
              </div>
            )}

            {/* Barra de seleção / Input de envio */}
            {selectMode ? (
              <div style={{
                background: '#fff', padding: '12px 20px', borderTop: '1px solid #d1d7db',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
              }}>
                <button
                  onClick={cancelarSelecao}
                  style={{ background: 'none', border: 'none', color: '#667781', fontSize: 14, cursor: 'pointer', padding: '8px 0' }}
                >
                  ✕ Cancelar
                </button>
                <span style={{ color: '#111b21', fontSize: 14, fontWeight: 500 }}>
                  {selectedIds.size} {selectedIds.size === 1 ? 'mensagem selecionada' : 'mensagens selecionadas'}
                </span>
                <button
                  onClick={apagarSelecionados}
                  disabled={selectedIds.size === 0}
                  style={{
                    background: selectedIds.size > 0 ? '#E53935' : '#adbac1',
                    border: 'none', color: '#fff', borderRadius: 8,
                    padding: '8px 18px', fontSize: 14, fontWeight: 600,
                    cursor: selectedIds.size > 0 ? 'pointer' : 'default'
                  }}
                >
                  🗑️ Apagar
                </button>
              </div>
            ) : (
            <div style={{
              background: '#f0f2f5', padding: '10px 16px',
              display: 'flex', alignItems: 'flex-end', gap: 10,
              borderTop: '1px solid #d1d7db', position: 'relative'
            }}>
              {/* Popup de respostas rápidas */}
              {qrOpen && (() => {
                const filtradas = respostasRapidas.filter(r =>
                  !qrFiltro || r.atalho.startsWith(qrFiltro) || r.titulo.toLowerCase().includes(qrFiltro)
                )
                if (filtradas.length === 0) return null
                return (
                  <div style={{
                    position: 'absolute', bottom: '100%', left: 0, right: 0,
                    background: '#fff', borderTop: '1px solid #e9edef',
                    borderBottom: 'none', boxShadow: '0 -4px 12px rgba(0,0,0,0.08)',
                    zIndex: 100, overflow: 'hidden'
                  }}>
                    <div style={{ padding: '6px 16px 4px', borderBottom: '1px solid #f0f2f5' }}>
                      <span style={{ fontSize: 11, color: '#adbac1', fontWeight: 600, letterSpacing: 0.5 }}>RESPOSTAS RÁPIDAS</span>
                    </div>
                    {filtradas.map((r, i) => (
                      <div
                        key={r.atalho}
                        onClick={() => aplicarRR(r.texto)}
                        style={{
                          padding: '10px 16px',
                          background: i === qrIdx ? '#f0f2f5' : '#fff',
                          cursor: 'pointer', borderBottom: '1px solid #f5f5f5',
                          display: 'flex', alignItems: 'center', gap: 10
                        }}
                      >
                        <span style={{
                          color: '#00a884', fontWeight: 700, fontSize: 12,
                          background: '#e8fce4', borderRadius: 4, padding: '1px 6px', flexShrink: 0
                        }}>/{r.atalho}</span>
                        <span style={{ color: '#111b21', fontSize: 13, fontWeight: 500, flexShrink: 0 }}>{r.titulo}</span>
                        <span style={{
                          color: '#667781', fontSize: 12,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }}>{r.texto}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}

              <button
                onClick={gerarSugestao}
                disabled={loadingSugestao}
                title="Gerar sugestão com IA"
                style={{
                  background: loadingSugestao ? '#e9edef' : '#e8fce4',
                  border: '1px solid #00a884', color: '#00a884',
                  borderRadius: 8, padding: '8px 12px', fontSize: 13,
                  cursor: loadingSugestao ? 'wait' : 'pointer',
                  flexShrink: 0, fontWeight: 600
                }}
              >
                {loadingSugestao ? '...' : '✦ IA'}
              </button>

              <textarea
                ref={inputRef}
                value={texto}
                onChange={e => {
                  const val = e.target.value
                  setTexto(val)
                  if (val.startsWith('/')) {
                    setQrFiltro(val.slice(1).toLowerCase())
                    setQrOpen(true)
                    setQrIdx(0)
                  } else {
                    setQrOpen(false)
                    setQrFiltro('')
                  }
                }}
                onKeyDown={e => {
                  if (qrOpen) {
                    const filtradas = respostasRapidas.filter(r =>
                      !qrFiltro || r.atalho.startsWith(qrFiltro) || r.titulo.toLowerCase().includes(qrFiltro)
                    )
                    if (e.key === 'ArrowDown') { e.preventDefault(); setQrIdx(i => Math.min(i + 1, filtradas.length - 1)); return }
                    if (e.key === 'ArrowUp')   { e.preventDefault(); setQrIdx(i => Math.max(i - 1, 0)); return }
                    if (e.key === 'Enter')     { e.preventDefault(); if (filtradas[qrIdx]) aplicarRR(filtradas[qrIdx].texto); return }
                    if (e.key === 'Escape')    { setQrOpen(false); setQrFiltro(''); return }
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    enviar(texto === sugestao)
                  }
                }}
                placeholder="Digite uma mensagem..."
                rows={1}
                style={{
                  flex: 1, background: '#ffffff', border: '1px solid #e9edef', outline: 'none',
                  borderRadius: 8, padding: '10px 14px', color: '#111b21',
                  fontSize: 14, resize: 'none', lineHeight: 1.5,
                  maxHeight: 120, overflowY: 'auto',
                  fontFamily: "'Segoe UI', system-ui, sans-serif"
                }}
              />

              <button
                onClick={() => enviar(texto === sugestao)}
                disabled={!texto.trim() || enviando}
                style={{
                  background: texto.trim() ? '#00a884' : '#adbac1',
                  border: 'none', color: '#fff', borderRadius: 8,
                  padding: '10px 16px', fontSize: 16,
                  cursor: texto.trim() ? 'pointer' : 'default',
                  flexShrink: 0, transition: 'background 0.2s'
                }}
              >
                {enviando ? '...' : '➤'}
              </button>
            </div>
            )}
          </>
        )}
      </div>

      {/* ── Painel direito: info do cliente ── */}
      {selecionado && (
        <div style={{
          width: 300, minWidth: 260, background: '#ffffff',
          borderLeft: '1px solid #d1d7db', display: 'flex', flexDirection: 'column',
          overflowY: 'auto'
        }}>

          {/* Avatar e nome */}
          <div style={{
            background: '#f0f2f5', padding: '24px 20px', textAlign: 'center',
            borderBottom: '1px solid #e9edef'
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <Avatar
                fotoUrl={conversaAtual?.foto_url}
                nome={nomeExibido}
                tel={selecionado}
                size={64}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span style={{ color: '#111b21', fontWeight: 700, fontSize: 16 }}>{nomeExibido}</span>

              {cliente ? (
                <button
                  onClick={() => setEditClienteOpen(true)}
                  title="Editar cliente"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: '#adbac1', fontSize: 14, padding: 0, lineHeight: 1,
                    display: 'flex', alignItems: 'center'
                  }}
                >
                  ⚙️
                </button>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => setNovoClienteOpen(true)}
                    title="Cadastrar novo Cliente"
                    style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: '#00a884', border: 'none', cursor: 'pointer',
                      color: '#fff', fontSize: 18, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      lineHeight: 1, flexShrink: 0
                    }}
                  >
                    +
                  </button>
                  <button
                    onClick={() => setVincularClienteOpen(true)}
                    title="Vincular a Cliente"
                    style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: '#1565c0', border: 'none', cursor: 'pointer',
                      color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                    </svg>
                  </button>
                </div>
              )}
            </div>
            {conversaAtual?.nome_cliente && conversaAtual.nome_contato && conversaAtual.nome_cliente !== conversaAtual.nome_contato && (
              <div style={{ color: '#adbac1', fontSize: 11, marginTop: 2 }}>{conversaAtual.nome_contato}</div>
            )}
            <div style={{ color: '#667781', fontSize: 13, marginTop: 4 }}>{formatTel(selecionado)}</div>
            {cliente && (
              <div style={{ color: '#f59e0b', fontSize: 16, marginTop: 6, letterSpacing: 2 }}>
                {scoreStars(cliente.score_fidelidade)}
              </div>
            )}
            {cliente?.observacao && (
              <div style={{
                marginTop: 10, padding: '7px 10px', borderRadius: 6,
                background: '#fff', border: '1px solid #e9edef',
                color: '#3b4a54', fontSize: 12, lineHeight: 1.5, textAlign: 'left'
              }}>
                {cliente.observacao}
              </div>
            )}
          </div>

          {/* Assinatura */}
          {cliente ? (
            <div style={{ padding: '14px 16px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10
              }}>
                <span style={{ color: '#667781', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Assinatura
                </span>
                {cliente.pacote && (() => {
                  const telas = cliente.id_pacote
                    ? (pacotes.find(p => p.id_pacote === String(cliente.id_pacote))?.telas ?? null)
                    : null
                  const n = contas.length
                  const t = telas
                  const [bg, cor, bord] = t == null || n === t
                    ? ['#e8f5e9', '#2e7d32', '#c8e6c9']
                    : n < t
                    ? ['#fff8e1', '#f57f17', '#ffe082']
                    : ['#ffebee', '#c62828', '#ffcdd2']
                  const tooltip = t == null ? cliente.pacote!
                    : n === t ? `Assinatura OK (${n}/${t} contas)`
                    : n < t  ? `Faltam contas na assinatura (${n}/${t})`
                    :          `Conta além do pacote (${n}/${t})`
                  return (
                    <span
                      title={tooltip}
                      style={{
                        background: bg, color: cor, fontSize: 11, fontWeight: 600,
                        borderRadius: 4, padding: '1px 6px', border: `1px solid ${bord}`,
                        cursor: t != null ? 'help' : 'default'
                      }}
                    >
                      {cliente.pacote}{t != null ? ` ${n}/${t}` : ''}
                    </span>
                  )
                })()}
                {cliente.id_assinatura && (
                  <button
                    onClick={() => { setEditAssinaturaAlvo(cliente); setEditAssinaturaOpen(true) }}
                    title="Editar assinatura"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: '#adbac1', fontSize: 14, padding: 0, lineHeight: 1,
                      display: 'flex', alignItems: 'center'
                    }}
                  >
                    ⚙️
                  </button>
                )}
              </div>
              {cliente.assinatura_observacao && (
                <div style={{
                  marginBottom: 10, padding: '6px 10px', borderRadius: 6,
                  background: '#f0f2f5', border: '1px solid #e9edef',
                  color: '#3b4a54', fontSize: 12, lineHeight: 1.5
                }}>
                  {cliente.assinatura_observacao}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 8px' }}>
                <div>
                  <div style={{ color: '#667781', fontSize: 11, marginBottom: 2 }}>Plano</div>
                  <div style={{ color: '#111b21', fontSize: 13, fontWeight: 500 }}>{cliente.plano ?? '—'}</div>
                </div>
                <div>
                  <div style={{ color: '#667781', fontSize: 11, marginBottom: 2 }}>Valor</div>
                  <div style={{ color: '#111b21', fontSize: 13, fontWeight: 500 }}>{formatValor(cliente.valor)}</div>
                </div>
                <div>
                  <div style={{ color: '#667781', fontSize: 11, marginBottom: 2 }}>Status</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: statusColor(cliente.status) }}>
                    ● {cliente.status ?? '—'}
                  </div>
                </div>
                <div>
                  <div style={{ color: '#667781', fontSize: 11, marginBottom: 2 }}>Venc. contrato</div>
                  <div style={{ color: '#111b21', fontSize: 13, fontWeight: 500 }}>
                    {cliente.venc_contrato ? formatData(cliente.venc_contrato) : '—'}
                  </div>
                </div>
              </div>

              {/* Contas vinculadas à assinatura principal */}
              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #e9edef' }}>
                <div style={{
                  color: '#667781', fontSize: 11, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6
                }}>
                  Contas
                </div>
                <ContasCards
                  contas={contas.filter(c => c.id_assinatura === String(cliente.id_assinatura))}
                  vencContas={cliente.venc_contas ?? null}
                  small
                />
              </div>

              {/* Outras assinaturas */}
              {(() => {
                const outras = assinaturas.filter(a => a.id_assinatura !== cliente.id_assinatura && a.id_assinatura != null)
                if (outras.length === 0) return null
                return (
                  <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #e9edef' }}>
                    {/* Cabeçalho com contador e toggle */}
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{
                        color: '#667781', fontSize: 11, fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: 1, flex: 1
                      }}>
                        Outras {outras.length}
                      </span>
                      <button
                        onClick={() => setOutrasRecolhidas(v => !v)}
                        title={outrasRecolhidas ? 'Expandir' : 'Recolher'}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: '#adbac1', fontSize: 13, padding: '0 2px', lineHeight: 1
                        }}
                      >
                        {outrasRecolhidas ? '▸' : '▾'}
                      </button>
                    </div>

                    {!outrasRecolhidas && outras.map(a => {
                      const contasA = contas.filter(c => c.id_assinatura === String(a.id_assinatura))
                      const telas = a.id_pacote
                        ? (pacotes.find(p => p.id_pacote === String(a.id_pacote))?.telas ?? null)
                        : null
                      const n = contasA.length
                      const [bg, cor, bord] = telas == null || n === telas
                        ? ['#e8f5e9', '#2e7d32', '#c8e6c9']
                        : n < telas
                        ? ['#fff8e1', '#f57f17', '#ffe082']
                        : ['#ffebee', '#c62828', '#ffcdd2']
                      const expandida = expandidasAssinaturas.has(a.id_assinatura!)
                      return (
                        <div key={a.id_assinatura} style={{ marginBottom: 3 }}>
                          {/* Linha principal clicável */}
                          <div
                            onClick={() => setExpandidasAssinaturas(prev => {
                              const next = new Set(prev)
                              expandida ? next.delete(a.id_assinatura!) : next.add(a.id_assinatura!)
                              return next
                            })}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 5,
                              padding: '4px 7px', borderRadius: expandida ? '6px 6px 0 0' : 6,
                              background: expandida ? '#edf2f7' : '#f8f9fa',
                              border: '1px solid #e9edef',
                              borderBottom: expandida ? 'none' : '1px solid #e9edef',
                              fontSize: 11, cursor: 'pointer', userSelect: 'none',
                            }}
                          >
                            <span style={{ color: '#adbac1', fontSize: 9, flexShrink: 0 }}>
                              {expandida ? '▾' : '▸'}
                            </span>
                            <span style={{ color: statusColor(a.status), fontSize: 9, flexShrink: 0 }}>●</span>
                            <span style={{ color: '#111b21', fontWeight: 500, flexShrink: 0, fontSize: 11 }}>
                              {a.plano ?? '—'}
                            </span>
                            <span style={{ color: '#adbac1' }}>·</span>
                            <span style={{ color: '#667781', flexShrink: 0 }}>{formatValor(a.valor)}</span>
                            <span style={{ color: '#adbac1' }}>·</span>
                            <span style={{ color: '#667781', flexShrink: 0 }}>
                              {a.venc_contrato ? formatData(a.venc_contrato) : '—'}
                            </span>
                            {a.pacote && (
                              <span style={{
                                background: bg, color: cor, fontSize: 9, fontWeight: 600,
                                borderRadius: 4, padding: '1px 4px', border: `1px solid ${bord}`,
                                flexShrink: 0, marginLeft: 'auto'
                              }}>
                                {a.pacote}{telas != null ? ` ${n}/${telas}` : ''}
                              </span>
                            )}
                            <button
                              onClick={e => { e.stopPropagation(); setEditAssinaturaAlvo(a); setEditAssinaturaOpen(true) }}
                              title="Editar assinatura"
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: '#adbac1', fontSize: 11, padding: 0, lineHeight: 1,
                                flexShrink: 0, display: 'flex', alignItems: 'center'
                              }}
                            >⚙️</button>
                          </div>

                          {/* Sub-linhas de contas */}
                          {expandida && (
                            <div style={{
                              background: '#f0f4f8', border: '1px solid #e9edef',
                              borderTop: 'none', borderRadius: '0 0 6px 6px',
                              padding: '5px 7px', display: 'flex', flexDirection: 'column', gap: 3
                            }}>
                              {contasA.length > 0 ? contasA.map(c => {
                                const label = c.vencimento_real_painel
                                  ? c.vencimento_real_painel.split('T')[0].split('-').slice(1).reverse().join('/')
                                  : c.status_conta
                                const [badgeBg, badgeFg] = c.status_conta === 'ok'
                                  ? ['#dcfce7', '#16a34a']
                                  : c.status_conta === 'vencida'
                                  ? ['#fef9c3', '#a16207']
                                  : ['#fee2e2', '#dc2626']
                                return (
                                  <div key={c.id_conta} style={{
                                    display: 'flex', alignItems: 'center', gap: 4, fontSize: 11
                                  }}>
                                    <span style={{ color: '#adbac1', fontSize: 9 }}>└</span>
                                    <span style={{ color: '#667781', fontWeight: 500 }}>{c.nome_painel}</span>
                                    <span style={{ color: '#adbac1' }}>·</span>
                                    <span style={{ fontFamily: 'monospace', color: '#111b21', fontWeight: 600 }} className="select-all">
                                      {c.usuario}
                                    </span>
                                    {c.senha && (
                                      <>
                                        <span style={{ color: '#adbac1' }}>/</span>
                                        <span style={{ fontFamily: 'monospace', color: '#54656f' }} className="select-all">
                                          {c.senha}
                                        </span>
                                      </>
                                    )}
                                    <span style={{
                                      marginLeft: 'auto', background: badgeBg, color: badgeFg,
                                      fontSize: 9, fontWeight: 600, borderRadius: 10, padding: '1px 5px', flexShrink: 0
                                    }}>{label}</span>
                                  </div>
                                )
                              }) : (
                                <span style={{ color: '#adbac1', fontSize: 11 }}>Sem contas vinculadas</span>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}

              {/* Aplicativos */}
              {aplicativos.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #e9edef' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{
                      color: '#667781', fontSize: 11, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: 1, flex: 1
                    }}>
                      Aplicativos {aplicativos.length}
                    </span>
                    <button
                      onClick={() => setAppsRecolhidos(v => !v)}
                      title={appsRecolhidos ? 'Expandir' : 'Recolher'}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#adbac1', fontSize: 13, padding: '0 2px', lineHeight: 1
                      }}
                    >
                      {appsRecolhidos ? '▸' : '▾'}
                    </button>
                  </div>
                  {!appsRecolhidos && <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {aplicativos.map(a => {
                      const vencida = a.validade ? new Date(a.validade) < new Date() : false
                      const [badgeBg, badgeFg] = (() => {
                        const s = (a.status ?? '').toLowerCase()
                        if (s === 'ativa' || s === 'ativo') return ['#dcfce7', '#16a34a']
                        if (s === 'pendente') return ['#fef9c3', '#854d0e']
                        if (s === 'bloqueado') return ['#ffedd5', '#9a3412']
                        return ['#fee2e2', '#991b1b']
                      })()
                      return (
                        <div key={a.id_app_registro} style={{
                          background: '#f8f9fa', border: '1px solid #e9edef',
                          borderRadius: 6, padding: '5px 8px', fontSize: 11,
                          display: 'flex', flexDirection: 'column', gap: 2
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ fontWeight: 600, color: '#111b21', flex: 1 }}>
                              {a.nome_app ?? `App #${a.id_app}`}
                            </span>
                            <span style={{
                              background: badgeBg, color: badgeFg, fontSize: 9,
                              fontWeight: 700, borderRadius: 4, padding: '1px 5px'
                            }}>
                              {a.status ?? '—'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: 6, color: '#667781', flexWrap: 'wrap' }}>
                            {a.validade && (
                              <span style={{ color: vencida ? '#ef4444' : '#667781' }}>
                                {vencida ? '⚠️ ' : ''}
                                {a.validade.split('T')[0].split('-').reverse().join('/')}
                              </span>
                            )}
                            {a.mac && (
                              <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#54656f' }}>
                                {a.mac}
                              </span>
                            )}
                            {a.chave && (
                              <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#54656f' }}>
                                {a.chave}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>}
                </div>
              )}

              {/* Pagamentos */}
              {pagamentos.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #e9edef' }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{
                      color: '#667781', fontSize: 11, fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: 1, flex: 1
                    }}>
                      Pagamentos {pagamentos.length}
                    </span>
                    <button
                      onClick={() => setPgtsRecolhidos(v => !v)}
                      title={pgtsRecolhidos ? 'Expandir' : 'Recolher'}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#adbac1', fontSize: 13, padding: '0 2px', lineHeight: 1
                      }}
                    >
                      {pgtsRecolhidos ? '▸' : '▾'}
                    </button>
                  </div>

                  {/* Último pagamento — sempre visível */}
                  {(() => {
                    const p = pagamentos[0]
                    return (
                      <PagamentoLinha p={p} destaque />
                    )
                  })()}

                  {/* Demais pagamentos — visíveis apenas quando expandido */}
                  {!pgtsRecolhidos && pagamentos.slice(1).map(p => (
                    <PagamentoLinha key={p.id} p={p} />
                  ))}
                </div>
              )}

              <div style={{ marginTop: 14 }}>
                <a
                  href={`/clientes/${cliente.id_cliente}`}
                  style={{
                    background: '#f0f2f5', color: '#111b21', textDecoration: 'none',
                    borderRadius: 8, padding: '8px 16px', textAlign: 'center',
                    fontSize: 13, fontWeight: 600, display: 'block',
                    border: '1px solid #d1d7db'
                  }}
                >
                  Ver ficha completa
                </a>
              </div>
            </div>
          ) : (
            <div style={{ padding: 24, textAlign: 'center', color: '#667781', fontSize: 13 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>👤</div>
              <div>Cliente não vinculado</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>{formatTel(selecionado)}</div>
            </div>
          )}
        </div>
      )}

      {/* Modal novo cliente */}
      {novoClienteOpen && selecionado && (
        <NovoClienteModal
          planos={planos}
          pacotes={pacotes}
          initialNome={conversaAtual?.nome_contato ?? ''}
          initialTelefone={selecionado.startsWith('55') ? selecionado.slice(2) : selecionado}
          initialNomeContato={conversaAtual?.nome_contato ?? ''}
          onClose={() => setNovoClienteOpen(false)}
          onSuccess={() => { setNovoClienteOpen(false); carregarMensagens(selecionado) }}
        />
      )}

      {/* Modal vincular a cliente existente */}
      {vincularClienteOpen && selecionado && (
        <VincularClienteModal
          telefone={selecionado}
          nomeContato={conversaAtual?.nome_contato ?? null}
          onClose={() => setVincularClienteOpen(false)}
          onSuccess={() => { setVincularClienteOpen(false); carregarMensagens(selecionado) }}
        />
      )}

      {/* Modal editar cliente */}
      {editClienteOpen && cliente && (
        <EditClienteModal
          idCliente={String(cliente.id_cliente)}
          nomeAtual={cliente.nome}
          observacaoAtual={cliente.observacao ?? null}
          observacaoAssinaturaAtual={cliente.assinatura_observacao ?? null}
          idAssinaturaPrincipal={cliente.id_assinatura ? String(cliente.id_assinatura) : null}
          onClose={() => setEditClienteOpen(false)}
          onSaved={() => { setEditClienteOpen(false); carregarMensagens(selecionado!) }}
        />
      )}

      {/* Modal editar assinatura */}
      {editAssinaturaOpen && editAssinaturaAlvo?.id_assinatura && cliente && (
        <EditAssinaturaModal
          idCliente={String(cliente.id_cliente)}
          assinatura={{
            id_assinatura: String(editAssinaturaAlvo.id_assinatura),
            id_plano: editAssinaturaAlvo.id_plano ? String(editAssinaturaAlvo.id_plano) : null,
            id_pacote: editAssinaturaAlvo.id_pacote ? String(editAssinaturaAlvo.id_pacote) : null,
            venc_contrato: editAssinaturaAlvo.venc_contrato ?? null,
            venc_contas: editAssinaturaAlvo.venc_contas ?? null,
            status: editAssinaturaAlvo.status ?? 'ativo',
            identificacao: (editAssinaturaAlvo as Cliente).identificacao ?? null,
            observacao: (editAssinaturaAlvo as Cliente).assinatura_observacao ?? null,
          }}
          planos={planos}
          pacotes={pacotes}
          onClose={() => { setEditAssinaturaOpen(false); setEditAssinaturaAlvo(null) }}
          onSaved={() => { setEditAssinaturaOpen(false); setEditAssinaturaAlvo(null); carregarMensagens(selecionado!) }}
        />
      )}

      {/* Modal encaminhar */}
      {forwardMsg && (
        <div onClick={() => setForwardMsg(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: 340, maxHeight: '70vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e9edef', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: 15, color: '#111b21' }}>Encaminhar para</span>
              <button onClick={() => setForwardMsg(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#667781' }}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {conversas.filter(c => c.telefone !== selecionado).map(c => {
                const nome = c.nome_cliente ?? c.nome_contato ?? formatTel(c.telefone)
                return (
                  <div key={c.telefone} onClick={() => encaminhar(forwardMsg, c.telefone)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #f0f2f5' }}>
                    <Avatar fotoUrl={c.foto_url} nome={nome} tel={c.telefone} size={38} />
                    <span style={{ fontSize: 14, color: '#111b21' }}>{nome}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Overlay para fechar menus ao clicar fora */}
      {(activeMenu !== null || emojiLibMsg !== null) && (
        <div onClick={fecharMenus} style={{ position: 'fixed', inset: 0, zIndex: 49 }} />
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, cursor: 'zoom-out'
          }}
        >
          <img
            src={lightbox}
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 4 }}
          />
          <button
            onClick={() => setLightbox(null)}
            style={{
              position: 'absolute', top: 20, right: 24,
              background: 'rgba(255,255,255,0.15)', border: 'none',
              color: '#fff', fontSize: 24, cursor: 'pointer',
              borderRadius: '50%', width: 40, height: 40,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >✕</button>
        </div>
      )}
    </div>
  )
}
