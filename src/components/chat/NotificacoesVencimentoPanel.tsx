'use client'

import { useEffect, useState, useCallback } from 'react'

interface Item {
  id_assinatura: string
  nome: string
  telefone: string | null
  telas: number
  venc_contrato: string
  jaEnviado: boolean
  erro?: string
}

type Tipo = 'vencidos' | 'amanha'

const TITULOS: Record<Tipo, string> = {
  vencidos: 'Notificar vencidos',
  amanha: 'Notificar vencem amanhã',
}

function ListaNotificacao({ tipo }: { tipo: Tipo }) {
  const [itens, setItens] = useState<Item[]>([])
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [carregando, setCarregando] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const resp = await fetch(`/api/whatsapp/notificacoes-vencimento?tipo=${tipo}`)
      const j = await resp.json()
      const novosItens: Item[] = j.itens ?? []
      setItens(novosItens)
      setSelecionados(new Set(novosItens.filter((i) => !i.jaEnviado).map((i) => i.id_assinatura)))
    } finally {
      setCarregando(false)
    }
  }, [tipo])

  useEffect(() => {
    carregar()
    const intervalo = setInterval(carregar, 60000)
    return () => clearInterval(intervalo)
  }, [carregar])

  function toggle(id: string) {
    setSelecionados((prev) => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  async function disparar() {
    const ids = Array.from(selecionados)
    if (ids.length === 0) return

    setEnviando(true)
    try {
      const resp = await fetch('/api/whatsapp/notificacoes-vencimento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, ids }),
      })
      const j = await resp.json()
      const resultados: { id_assinatura: string; ok: boolean; error?: string }[] = j.resultados ?? []

      setItens((prev) =>
        prev.map((item) => {
          const r = resultados.find((x) => x.id_assinatura === item.id_assinatura)
          if (!r) return item
          return r.ok ? { ...item, jaEnviado: true, erro: undefined } : { ...item, erro: r.error }
        })
      )
      setSelecionados((prev) => {
        const novo = new Set(prev)
        for (const r of resultados) if (r.ok) novo.delete(r.id_assinatura)
        return novo
      })
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div style={{
      flex: 1, minWidth: 280, maxWidth: 380, background: '#fff', borderRadius: 8,
      border: '1px solid #d1d7db', display: 'flex', flexDirection: 'column', maxHeight: 420,
    }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #d1d7db' }}>
        <button
          type="button"
          onClick={disparar}
          disabled={enviando || selecionados.size === 0}
          style={{
            width: '100%', background: selecionados.size === 0 ? '#c4c9cc' : '#00a884',
            color: '#fff', border: 'none', borderRadius: 6, padding: '8px 12px',
            fontSize: 13, fontWeight: 600, cursor: selecionados.size === 0 ? 'default' : 'pointer',
          }}
        >
          {enviando ? 'Enviando...' : `${TITULOS[tipo]} (${selecionados.size})`}
        </button>
      </div>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {carregando && itens.length === 0 && (
          <div style={{ padding: 16, fontSize: 13, color: '#667781', textAlign: 'center' }}>Carregando...</div>
        )}
        {!carregando && itens.length === 0 && (
          <div style={{ padding: 16, fontSize: 13, color: '#667781', textAlign: 'center' }}>Ninguém nessa lista agora.</div>
        )}
        {itens.map((item) => (
          <div
            key={item.id_assinatura}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
              borderBottom: '1px solid #f0f2f5', fontSize: 13,
            }}
          >
            <input
              type="checkbox"
              checked={selecionados.has(item.id_assinatura)}
              onChange={() => toggle(item.id_assinatura)}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#111b21', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.nome} <span style={{ color: '#667781', fontWeight: 400 }}>{item.telefone ?? '(sem telefone)'}</span>
              </div>
              {item.erro && (
                <div style={{ color: '#d32f2f', fontSize: 11 }}>Falha: {item.erro}</div>
              )}
            </div>
            <input type="checkbox" checked={item.jaEnviado} readOnly disabled title="Já enviado hoje" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function NotificacoesVencimentoPanel() {
  return (
    <div style={{ display: 'flex', gap: 16, marginTop: 24, width: '100%', maxWidth: 800, justifyContent: 'center' }}>
      <ListaNotificacao tipo="vencidos" />
      <ListaNotificacao tipo="amanha" />
    </div>
  )
}
