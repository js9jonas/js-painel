'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

interface Pack { id: string; nome: string; emoji: string; stickers: string[] }
interface GifItem { id: string; tinygif: string; gif: string; mp4: string; title: string }

interface Props {
  onSendSticker: (url: string) => void
  onSendGif: (gifUrl: string, mp4Url: string) => void
  onClose: () => void
}

const TAB_FAVORITOS = '__favoritos__'
const TAB_GIFS = '__gifs__'

export default function StickerPicker({ onSendSticker, onSendGif, onClose }: Props) {
  const [packs, setPacks] = useState<Pack[]>([])
  const [favoritos, setFavoritos] = useState<string[]>([])
  const [tabAtiva, setTabAtiva] = useState<string>(TAB_FAVORITOS)
  const [gifs, setGifs] = useState<GifItem[]>([])
  const [gifQuery, setGifQuery] = useState('')
  const [gifNext, setGifNext] = useState('')
  const [gifLoading, setGifLoading] = useState(false)
  const [hoverSticker, setHoverSticker] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const gifGridRef = useRef<HTMLDivElement>(null)

  // Fecha ao clicar fora
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Carrega packs e favoritos
  useEffect(() => {
    fetch('/api/whatsapp/stickers').then(r => r.json()).then(d => setPacks(d.packs ?? []))
    fetch('/api/whatsapp/stickers?tipo=favoritos').then(r => r.json()).then(d => setFavoritos(d.favoritos ?? []))
  }, [])

  // Quando abre tab GIFs, carrega featured
  useEffect(() => {
    if (tabAtiva === TAB_GIFS && gifs.length === 0) buscarGifs('', '')
  }, [tabAtiva])

  async function buscarGifs(q: string, pos: string) {
    setGifLoading(true)
    try {
      const r = await fetch(`/api/tenor?q=${encodeURIComponent(q)}&pos=${pos}`)
      const d = await r.json()
      setGifs(prev => pos ? [...prev, ...(d.results ?? [])] : (d.results ?? []))
      setGifNext(d.next ?? '')
    } finally {
      setGifLoading(false)
    }
  }

  function onGifSearch(q: string) {
    setGifQuery(q)
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => {
      setGifs([])
      setGifNext('')
      buscarGifs(q, '')
    }, 400)
  }

  // Infinite scroll dos GIFs
  const onGifScroll = useCallback(() => {
    const el = gifGridRef.current
    if (!el || gifLoading || !gifNext) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) {
      buscarGifs(gifQuery, gifNext)
    }
  }, [gifLoading, gifNext, gifQuery])

  async function toggleFavorito(url: string) {
    await fetch('/api/whatsapp/stickers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    setFavoritos(prev =>
      prev.includes(url) ? prev.filter(u => u !== url) : [url, ...prev]
    )
  }

  const stickersExibidos = (() => {
    if (tabAtiva === TAB_FAVORITOS) return favoritos
    if (tabAtiva === TAB_GIFS) return []
    return packs.find(p => p.id === tabAtiva)?.stickers ?? []
  })()

  const tabs = [
    { id: TAB_FAVORITOS, label: '⭐' },
    ...packs.map(p => ({ id: p.id, label: p.emoji })),
    { id: TAB_GIFS, label: 'GIF' },
  ]

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute', bottom: '100%', left: 0, marginBottom: 8,
        width: 380, height: 420, background: '#fff',
        border: '1px solid #d1d7db', borderRadius: 12,
        boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 200,
      }}
    >
      {/* Tabs */}
      <div style={{
        display: 'flex', borderBottom: '1px solid #e9edef',
        background: '#f0f2f5', overflowX: 'auto', flexShrink: 0,
        scrollbarWidth: 'none',
      }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setTabAtiva(tab.id)}
            style={{
              border: 'none', background: 'none', cursor: 'pointer',
              padding: '8px 14px', fontSize: tab.id === TAB_GIFS ? 11 : 18,
              fontWeight: tab.id === TAB_GIFS ? 800 : 400,
              color: tabAtiva === tab.id ? '#00a884' : '#667781',
              borderBottom: tabAtiva === tab.id ? '2px solid #00a884' : '2px solid transparent',
              transition: 'all 0.15s', flexShrink: 0, letterSpacing: tab.id === TAB_GIFS ? 0.5 : 0,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Label do pack atual */}
      {tabAtiva !== TAB_GIFS && (
        <div style={{
          padding: '6px 12px', fontSize: 11, fontWeight: 700,
          color: '#667781', textTransform: 'uppercase', letterSpacing: 0.8,
          background: '#f0f2f5', borderBottom: '1px solid #e9edef', flexShrink: 0,
        }}>
          {tabAtiva === TAB_FAVORITOS
            ? `Favoritos (${favoritos.length})`
            : packs.find(p => p.id === tabAtiva)?.nome ?? ''}
        </div>
      )}

      {/* GIFs */}
      {tabAtiva === TAB_GIFS ? (
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div style={{ padding: '8px 10px', flexShrink: 0 }}>
            <input
              value={gifQuery}
              onChange={e => onGifSearch(e.target.value)}
              placeholder="Buscar GIFs..."
              autoFocus
              style={{
                width: '100%', padding: '7px 12px', borderRadius: 20,
                border: '1px solid #d1d7db', fontSize: 13, outline: 'none',
                background: '#f0f2f5', boxSizing: 'border-box',
              }}
            />
          </div>
          <div
            ref={gifGridRef}
            onScroll={onGifScroll}
            style={{
              flex: 1, overflowY: 'auto', padding: '4px 8px 8px',
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4,
              alignContent: 'start',
            }}
          >
            {gifs.map(gif => (
              <div
                key={gif.id}
                onClick={() => { onSendGif(gif.gif, gif.mp4); onClose() }}
                style={{
                  borderRadius: 6, overflow: 'hidden', cursor: 'pointer',
                  background: '#f0f2f5', aspectRatio: '1',
                  transition: 'transform 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.04)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
              >
                <img
                  src={gif.tinygif}
                  alt={gif.title}
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>
            ))}
            {gifLoading && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 12, color: '#adbac1', fontSize: 13 }}>
                Carregando...
              </div>
            )}
            {!gifLoading && gifs.length === 0 && (
              <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 20, color: '#adbac1', fontSize: 13 }}>
                {gifQuery ? 'Nenhum GIF encontrado' : 'Digite para buscar GIFs'}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Stickers grid */
        <div style={{
          flex: 1, overflowY: 'auto', padding: 8,
          display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4,
          alignContent: 'start',
        }}>
          {stickersExibidos.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 24, color: '#adbac1', fontSize: 13 }}>
              {tabAtiva === TAB_FAVORITOS ? 'Nenhum favorito ainda.\nClique com o botão direito em um sticker para favoritar.' : 'Pack vazio'}
            </div>
          )}
          {stickersExibidos.map(url => (
            <div
              key={url}
              style={{ position: 'relative' }}
              onMouseEnter={() => setHoverSticker(url)}
              onMouseLeave={() => setHoverSticker(null)}
            >
              <img
                src={url}
                alt=""
                loading="lazy"
                onClick={() => { onSendSticker(url); onClose() }}
                style={{
                  width: '100%', aspectRatio: '1', objectFit: 'contain',
                  cursor: 'pointer', borderRadius: 8, padding: 2,
                  background: hoverSticker === url ? '#f0f2f5' : 'transparent',
                  transition: 'background 0.1s, transform 0.1s',
                  transform: hoverSticker === url ? 'scale(1.12)' : 'scale(1)',
                  display: 'block',
                }}
              />
              {hoverSticker === url && (
                <button
                  onClick={e => { e.stopPropagation(); toggleFavorito(url) }}
                  title={favoritos.includes(url) ? 'Remover dos favoritos' : 'Favoritar'}
                  style={{
                    position: 'absolute', top: 2, right: 2,
                    background: favoritos.includes(url) ? '#f59e0b' : 'rgba(0,0,0,0.35)',
                    border: 'none', borderRadius: '50%',
                    width: 18, height: 18, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, color: '#fff', lineHeight: 1,
                  }}
                >
                  ★
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
