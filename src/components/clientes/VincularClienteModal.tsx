"use client"

import { useState, useRef, useTransition } from 'react'
import { buscarClientes, type ClienteBuscaRow } from '@/app/actions/buscarClientes'
import { vincularContatoNoChat } from '@/app/actions/contatos'

type Props = {
  telefone: string
  nomeContato: string | null
  onClose: () => void
  onSuccess: () => void
}

export default function VincularClienteModal({ telefone, nomeContato, onClose, onSuccess }: Props) {
  const [busca, setBusca] = useState('')
  const [resultados, setResultados] = useState<ClienteBuscaRow[]>([])
  const [buscando, setBuscando] = useState(false)
  const [dropdownAberto, setDropdownAberto] = useState(false)
  const [clienteSelecionado, setClienteSelecionado] = useState<ClienteBuscaRow | null>(null)
  const [nome, setNome] = useState(nomeContato ?? '')
  const [referencia, setReferencia] = useState('')
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleBusca(valor: string) {
    setBusca(valor)
    setClienteSelecionado(null)
    setDropdownAberto(true)
    if (!valor.trim()) { setResultados([]); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setBuscando(true)
      try { setResultados(await buscarClientes(valor)) }
      finally { setBuscando(false) }
    }, 300)
  }

  function selecionar(c: ClienteBuscaRow) {
    setClienteSelecionado(c)
    setBusca(c.nome)
    setResultados([])
    setDropdownAberto(false)
  }

  function handleVincular() {
    if (!clienteSelecionado) { setErro('Selecione um cliente'); return }
    setErro(null)
    startTransition(async () => {
      try {
        await vincularContatoNoChat(telefone, clienteSelecionado.id_cliente, nome || null, referencia || null)
        onSuccess()
      } catch (e: any) {
        setErro(e?.message ?? 'Erro ao vincular')
      }
    })
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
        zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          width: 380, maxWidth: '95vw', padding: '24px 24px 20px'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 28, height: 28, borderRadius: '50%', background: '#1565c0',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </span>
            <span style={{ fontWeight: 700, fontSize: 15, color: '#111b21' }}>Vincular a Cliente</span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8696a0', fontSize: 18, lineHeight: 1, padding: 2 }}
          >
            ✕
          </button>
        </div>

        {/* Telefone */}
        <div style={{ fontSize: 12, color: '#667781', marginBottom: 14 }}>
          Telefone: <strong style={{ color: '#111b21' }}>{telefone}</strong>
        </div>

        {/* Busca de cliente */}
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#3b4a54', marginBottom: 5 }}>
          Cliente existente *
        </label>
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <input
            value={busca}
            onChange={e => handleBusca(e.target.value)}
            onFocus={() => busca && setDropdownAberto(true)}
            onBlur={() => setTimeout(() => setDropdownAberto(false), 150)}
            placeholder="Buscar por nome..."
            autoComplete="off"
            style={{
              width: '100%', boxSizing: 'border-box',
              border: `1px solid ${clienteSelecionado ? '#00a884' : '#d1d5db'}`,
              borderRadius: 8, padding: '8px 12px', fontSize: 13,
              outline: 'none', color: '#111b21',
              background: clienteSelecionado ? '#f0fdf4' : '#fff'
            }}
          />
          {clienteSelecionado && (
            <span style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              fontSize: 11, color: '#00a884', fontWeight: 600
            }}>
              ✓ ID {clienteSelecionado.id_cliente}
            </span>
          )}
          {dropdownAberto && busca.trim() && (
            <div style={{
              position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
              background: '#fff', border: '1px solid #e9edef', borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)', marginTop: 2,
              maxHeight: 200, overflowY: 'auto'
            }}>
              {buscando ? (
                <div style={{ padding: '10px 12px', fontSize: 12, color: '#8696a0' }}>Buscando...</div>
              ) : resultados.length > 0 ? (
                resultados.map(c => (
                  <button
                    key={c.id_cliente}
                    type="button"
                    onMouseDown={() => selecionar(c)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '9px 12px', border: 'none',
                      background: 'none', cursor: 'pointer', textAlign: 'left',
                      borderBottom: '1px solid #f0f2f5'
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f0f2f5')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111b21' }}>{c.nome}</div>
                      {c.observacao && (
                        <div style={{ fontSize: 11, color: '#8696a0', marginTop: 1 }}>{c.observacao}</div>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: '#adbac1', flexShrink: 0, marginLeft: 8 }}>
                      ID {c.id_cliente}
                    </span>
                  </button>
                ))
              ) : (
                <div style={{ padding: '10px 12px', fontSize: 12, color: '#8696a0' }}>Nenhum cliente encontrado</div>
              )}
            </div>
          )}
        </div>

        {/* Nome do contato */}
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#3b4a54', marginBottom: 5 }}>
          Nome do contato
        </label>
        <input
          value={nome}
          onChange={e => setNome(e.target.value)}
          placeholder="Nome exibido no WhatsApp"
          style={{
            width: '100%', boxSizing: 'border-box',
            border: '1px solid #d1d5db', borderRadius: 8,
            padding: '8px 12px', fontSize: 13, outline: 'none',
            color: '#111b21', marginBottom: 12
          }}
        />

        {/* Referência */}
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#3b4a54', marginBottom: 5 }}>
          Referência <span style={{ fontWeight: 400, color: '#adbac1' }}>(opcional)</span>
        </label>
        <input
          value={referencia}
          onChange={e => setReferencia(e.target.value)}
          placeholder="Ex: cônjuge, familiar, trabalho..."
          style={{
            width: '100%', boxSizing: 'border-box',
            border: '1px solid #d1d5db', borderRadius: 8,
            padding: '8px 12px', fontSize: 13, outline: 'none',
            color: '#111b21', marginBottom: 16
          }}
        />

        {erro && (
          <div style={{ color: '#e53935', fontSize: 12, marginBottom: 12 }}>{erro}</div>
        )}

        {/* Botões */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            disabled={isPending}
            style={{
              padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db',
              background: '#fff', color: '#3b4a54', fontSize: 13, cursor: 'pointer', fontWeight: 500
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleVincular}
            disabled={isPending || !clienteSelecionado}
            style={{
              padding: '8px 18px', borderRadius: 8, border: 'none',
              background: clienteSelecionado ? '#1565c0' : '#b0bec5',
              color: '#fff', fontSize: 13, cursor: clienteSelecionado ? 'pointer' : 'not-allowed',
              fontWeight: 600
            }}
          >
            {isPending ? 'Vinculando...' : 'Vincular'}
          </button>
        </div>
      </div>
    </div>
  )
}
