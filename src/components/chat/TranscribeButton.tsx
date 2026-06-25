'use client'

import { useState } from 'react'

interface Props {
  msgId: number
  fromMe: boolean
  onTranscribed: (transcricao: string) => void
}

export default function TranscribeButton({ msgId, fromMe, onTranscribed }: Props) {
  const [loading, setLoading]   = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setErrorMsg(null)
    try {
      const res = await fetch('/api/whatsapp/transcrever', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msgId }),
      })
      const data = await res.json() as { transcricao?: string; error?: string }
      if (!res.ok) {
        setErrorMsg(data.error ?? `HTTP ${res.status}`)
      } else if (data.transcricao) {
        onTranscribed(data.transcricao)
      }
    } catch (e) {
      setErrorMsg(String(e))
    } finally {
      setLoading(false)
    }
  }

  const color = fromMe ? '#075e54' : '#667781'

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        title={errorMsg ?? 'Transcrever áudio'}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'transparent', border: 'none',
          cursor: loading ? 'default' : 'pointer',
          padding: '2px 0 0', color, fontSize: 11,
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? (
          <>
            <span style={{
              width: 10, height: 10,
              border: `1.5px solid ${color}`, borderTopColor: 'transparent',
              borderRadius: '50%', display: 'inline-block',
              animation: 'spin 0.7s linear infinite',
            }} />
            Transcrevendo…
          </>
        ) : errorMsg ? (
          <span title={errorMsg} style={{ color: '#e53935' }}>⚠ Erro — tentar novamente</span>
        ) : (
          '🎙 Transcrever'
        )}
      </button>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
