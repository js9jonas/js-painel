'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

interface ClienteInfo {
  nome: string
  plano?: string | null
  status?: string | null
  vencimento?: string | null
}

interface MensagemAgente {
  role: 'user' | 'assistant'
  content: string
  sugestao?: string | null
}

interface Props {
  historico: string
  cliente: ClienteInfo | null
  // Se aberto a partir do botão "Ajustar" numa sugestão já gerada, pré-carrega o painel com ela.
  sugestaoInicial: string | null
  onAplicar: (sugestao: string) => void
  onClose: () => void
}

export default function AgenteAtendimentoPanel({ historico, cliente, sugestaoInicial, onAplicar, onClose }: Props) {
  const [mensagens, setMensagens] = useState<MensagemAgente[]>(
    sugestaoInicial
      ? [{ role: 'assistant', content: sugestaoInicial, sugestao: sugestaoInicial }]
      : []
  )
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  async function enviarParaAgente() {
    const texto = input.trim()
    if (!texto || loading) return
    setErro(null)
    setInput('')
    const novasMensagens: MensagemAgente[] = [...mensagens, { role: 'user', content: texto }]
    setMensagens(novasMensagens)
    setLoading(true)
    try {
      const res = await fetch('/api/ia/sugestao-chat/conversar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          historico,
          cliente,
          mensagens: novasMensagens.map((m) => ({ role: m.role, content: m.content })),
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { sugestao?: string; comentario?: string | null; error?: string }
      if (data.error) throw new Error(data.error)
      const sugestao = data.sugestao ?? ''
      setMensagens((prev) => [
        ...prev,
        { role: 'assistant', content: data.comentario || sugestao, sugestao },
      ])
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao falar com o agente')
      // devolve a mensagem digitada pro input pra não perder o que foi escrito
      setInput(texto)
      setMensagens(mensagens)
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviarParaAgente()
    }
  }

  return (
    <div style={{
      background: '#fff', borderTop: '1px solid #d1d7db',
      display: 'flex', flexDirection: 'column', maxHeight: 320,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px', borderBottom: '1px solid #f0f2f5', flexShrink: 0,
      }}>
        <span style={{ color: '#00a884', fontSize: 12, fontWeight: 600 }}>💬 Conversar com o agente</span>
        <button
          onClick={onClose}
          style={{ background: 'transparent', color: '#667781', border: 'none', fontSize: 16, cursor: 'pointer', padding: '0 4px' }}
        >✕</button>
      </div>

      <div style={{ overflowY: 'auto', padding: '10px 16px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {mensagens.length === 0 && (
          <div style={{ color: '#667781', fontSize: 13, textAlign: 'center', padding: '12px 0' }}>
            Explique o que você quer que a resposta diga, ou já dê um contexto que o histórico não mostra.
          </div>
        )}
        {mensagens.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              maxWidth: '85%', padding: '8px 12px', borderRadius: 10, fontSize: 13,
              background: m.role === 'user' ? '#d9fdd3' : '#f0f2f5',
              color: '#111b21',
            }}>
              {m.role === 'assistant' && m.sugestao ? (
                <>
                  {m.content !== m.sugestao && <div style={{ marginBottom: 6, color: '#54656f' }}>{m.content}</div>}
                  <div style={{
                    background: '#fff', border: '1px solid #00a884', borderRadius: 8,
                    padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{ flex: 1 }}>{m.sugestao}</span>
                    <button
                      onClick={() => { onAplicar(m.sugestao!); onClose() }}
                      style={{
                        background: '#00a884', color: '#fff', border: 'none',
                        borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', flexShrink: 0,
                      }}
                    >Usar</button>
                  </div>
                </>
              ) : m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ color: '#667781', fontSize: 13 }}>Pensando...</div>
        )}
        {erro && (
          <div style={{ color: '#d32f2f', fontSize: 12 }}>⚠ {erro}</div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '8px 16px 12px', flexShrink: 0 }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ex: ele já pagou, só não caiu no sistema ainda — dá um prazo de 24h"
          rows={1}
          style={{
            flex: 1, resize: 'none', border: '1px solid #d1d7db', borderRadius: 8,
            padding: '8px 10px', fontSize: 13, fontFamily: 'inherit', outline: 'none',
          }}
        />
        <button
          onClick={enviarParaAgente}
          disabled={loading || !input.trim()}
          style={{
            background: loading || !input.trim() ? '#adbac1' : '#00a884', color: '#fff', border: 'none',
            borderRadius: 8, padding: '0 16px', fontSize: 13, fontWeight: 600,
            cursor: loading || !input.trim() ? 'default' : 'pointer', flexShrink: 0,
          }}
        >Enviar</button>
      </div>
    </div>
  )
}
