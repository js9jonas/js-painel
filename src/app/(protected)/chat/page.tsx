'use client'

import React from 'react'
import { useEffect, useRef, useState, useCallback } from 'react'

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
  origem: 'cliente' | 'jonas' | 'ia'
  sugestao_ia: string | null
  foi_aceita: boolean | null
  mensagem_final: string | null
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
  plano: string | null
  status: string | null
  venc_contrato: string | null
  venc_contas: string | null
  valor: number | null
  servidor: string | null
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
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  })
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
  if (source === 'n8n') return { icon: '🤖', text: 'Automático' }
  if (source === 'phone') return { icon: '📱', text: 'Celular' }
  return { icon: '💬', text: source }
}

function nomeInicial(nome: string | null, tel: string) {
  const n = nome ?? formatTel(tel)
  return n.split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase()
}

function Avatar({
  fotoUrl, nome, tel, size, hasClient
}: {
  fotoUrl?: string | null
  nome: string | null
  tel: string
  size: number
  hasClient?: boolean
}) {
  if (fotoUrl) {
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden'
      }}>
        <img
          src={fotoUrl}
          alt={nome ?? tel}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={e => {
            const el = e.currentTarget
            el.style.display = 'none'
            el.parentElement!.style.background = hasClient ? '#00a884' : '#adbac1'
            el.parentElement!.style.display = 'flex'
            el.parentElement!.style.alignItems = 'center'
            el.parentElement!.style.justifyContent = 'center'
            el.parentElement!.innerHTML = `<span style="color:#fff;font-size:${Math.round(size * 0.38)}px;font-weight:700">${nomeInicial(nome, tel)}</span>`
          }}
        />
      </div>
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: hasClient ? '#00a884' : '#adbac1',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.38), fontWeight: 700, color: '#fff'
    }}>
      {nomeInicial(nome, tel)}
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
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const prevMsgCountRef = useRef(0)

  const carregarConversas = useCallback(async () => {
    const res = await fetch('/api/whatsapp/conversas')
    if (res.ok) setConversas(await res.json())
  }, [])

  useEffect(() => {
    carregarConversas()
    const interval = setInterval(carregarConversas, 10000)
    return () => clearInterval(interval)
  }, [carregarConversas])

  const carregarMensagens = useCallback(async (tel: string) => {
    setLoadingMsgs(true)
    const res = await fetch(`/api/whatsapp/mensagens?telefone=${tel}`)
    if (res.ok) {
      const data = await res.json()
      setMensagens(data.mensagens)
      setCliente(data.cliente)
    }
    setLoadingMsgs(false)
  }, [])

  useEffect(() => {
    if (!selecionado) return
    carregarMensagens(selecionado)
    const interval = setInterval(() => carregarMensagens(selecionado), 5000)
    return () => clearInterval(interval)
  }, [selecionado, carregarMensagens])

  useEffect(() => {
    if (mensagens.length > prevMsgCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevMsgCountRef.current = mensagens.length
  }, [mensagens])

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
    const msgFinal = texto.trim()
    setTexto('')
    setSugestao('')
    try {
      await fetch('/api/whatsapp/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telefone: selecionado,
          mensagem: msgFinal,
          sugestao_ia: usouSugestao ? sugestao : null,
          foi_aceita: usouSugestao ? true : null
        })
      })
      await carregarMensagens(selecionado)
    } finally {
      setEnviando(false)
      inputRef.current?.focus()
    }
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: '#667781', fontSize: 12 }}>{conversas.length} conv.</span>
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
              : (conv.ultima_mensagem ?? '')

            return (
              <div
                key={conv.telefone}
                onClick={() => setSelecionado(conv.telefone)}
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
                  hasClient={!!conv.id_cliente}
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
                hasClient={!!conversaAtual?.id_cliente}
              />
              <div>
                <div style={{ color: '#111b21', fontWeight: 600, fontSize: 15 }}>{nomeExibido}</div>
                <div style={{ color: '#667781', fontSize: 12 }}>{formatTel(selecionado)}</div>
              </div>
            </div>

            {/* Mensagens */}
            <div style={{
              flex: 1, overflowY: 'auto', padding: '16px 20px',
              display: 'flex', flexDirection: 'column', gap: 4
            }}>
              {loadingMsgs && mensagens.length === 0 && (
                <div style={{ textAlign: 'center', color: '#667781', marginTop: 40 }}>Carregando...</div>
              )}

              {mensagens.map((msg, i) => {
                const isCliente = msg.origem === 'cliente'
                const showData = i === 0 ||
                  new Date(msg.recebida_em).toDateString() !==
                  new Date(mensagens[i - 1].recebida_em).toDateString()

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

                    <div style={{
                      display: 'flex',
                      justifyContent: isCliente ? 'flex-start' : 'flex-end',
                      marginBottom: 2
                    }}>
                      <div style={{
                        maxWidth: '65%', padding: '8px 12px',
                        borderRadius: isCliente ? '0 8px 8px 8px' : '8px 0 8px 8px',
                        background: isCliente ? '#ffffff' : '#d9fdd3',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.13)'
                      }}>
                        {msg.tipo === 'text' && (
                          <div style={{ color: '#111b21', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                            {msg.conteudo}
                          </div>
                        )}
                        {msg.tipo === 'audio' && <div style={{ color: '#667781', fontSize: 13 }}>🎵 Áudio</div>}
                        {msg.tipo === 'image' && <div style={{ color: '#667781', fontSize: 13 }}>📷 Imagem</div>}
                        {msg.tipo === 'document' && <div style={{ color: '#667781', fontSize: 13 }}>📄 Documento</div>}
                        {msg.tipo === 'video' && <div style={{ color: '#667781', fontSize: 13 }}>🎥 Vídeo</div>}

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
                    </div>
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            {/* Sugestão de IA */}
            {sugestao && (
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

            {/* Input de envio */}
            <div style={{
              background: '#f0f2f5', padding: '10px 16px',
              display: 'flex', alignItems: 'flex-end', gap: 10,
              borderTop: '1px solid #d1d7db'
            }}>
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
                onChange={e => setTexto(e.target.value)}
                onKeyDown={e => {
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
                hasClient={!!cliente}
              />
            </div>
            <div style={{ color: '#111b21', fontWeight: 700, fontSize: 16 }}>{nomeExibido}</div>
            <div style={{ color: '#667781', fontSize: 13, marginTop: 4 }}>{formatTel(selecionado)}</div>
            {cliente && (
              <div style={{ color: '#f59e0b', fontSize: 16, marginTop: 6, letterSpacing: 2 }}>
                {scoreStars(cliente.score_fidelidade)}
              </div>
            )}
          </div>

          {/* Assinatura */}
          {cliente ? (
            <div style={{ padding: '16px 20px' }}>
              <div style={{
                color: '#667781', fontSize: 11, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12
              }}>
                Assinatura
              </div>

              <InfoRow label="Plano" value={cliente.plano ?? '—'} />
              <InfoRow label="Servidor" value={cliente.servidor ?? '—'} />
              <InfoRow label="Valor" value={formatValor(cliente.valor)} />
              <InfoRow
                label="Status"
                value={
                  <span style={{ color: statusColor(cliente.status), fontWeight: 700 }}>
                    ● {(cliente.status ?? '—')}
                  </span>
                }
              />
              <InfoRow label="Venc. contrato" value={cliente.venc_contrato ? formatData(cliente.venc_contrato) : '—'} />
              <InfoRow label="Venc. contas" value={cliente.venc_contas ? formatData(cliente.venc_contas) : '—'} />

              {cliente.observacao && (
                <div style={{ marginTop: 16 }}>
                  <div style={{
                    color: '#667781', fontSize: 11, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6
                  }}>
                    Observação
                  </div>
                  <div style={{
                    background: '#f0f2f5', borderRadius: 8, padding: '10px 12px',
                    color: '#3b4a54', fontSize: 13, lineHeight: 1.5
                  }}>
                    {cliente.observacao}
                  </div>
                </div>
              )}

              <div style={{ marginTop: 20 }}>
                <a
                  href={`/clientes/${cliente.id_cliente}`}
                  style={{
                    background: '#f0f2f5', color: '#111b21', textDecoration: 'none',
                    borderRadius: 8, padding: '10px 16px', textAlign: 'center',
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

          {/* Resumo */}
          <div style={{ padding: '0 20px 20px', marginTop: 8 }}>
            <div style={{
              color: '#667781', fontSize: 11, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10
            }}>
              Resumo
            </div>
            <InfoRow label="Total mensagens" value={String(mensagens.length)} />
            <InfoRow
              label="Última mensagem"
              value={conversaAtual ? formatHora(conversaAtual.ultima_mensagem_em) : '—'}
            />
          </div>
        </div>
      )}
    </div>
  )
}
