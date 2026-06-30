'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Item {
  href: string
  label: string
}

export default function NavDropdown({ label, items }: { label: string; items: Item[] }) {
  const [aberto, setAberto] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const pathname = usePathname()

  const ativo = items.some(i => pathname === i.href || pathname.startsWith(i.href + '/'))

  useEffect(() => {
    function fechar(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [])

  function handleToggle() {
    if (!aberto && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right })
    }
    setAberto(v => !v)
  }

  return (
    <div ref={ref}>
      <button
        ref={btnRef}
        onClick={handleToggle}
        className={`flex items-center gap-1 rounded-lg px-3 py-2 text-sm transition-all whitespace-nowrap ${
          ativo
            ? 'bg-zinc-100 text-zinc-900 font-medium'
            : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
        }`}
      >
        {label}
        <svg
          className={`w-3.5 h-3.5 transition-transform ${aberto ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {aberto && (
        <div
          className="fixed w-44 rounded-xl border border-zinc-200 bg-white shadow-lg py-1 z-50"
          style={{ top: pos.top, right: pos.right }}
        >
          {items.map(item => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setAberto(false)}
              className={`block px-4 py-2 text-sm transition-colors ${
                pathname === item.href || pathname.startsWith(item.href + '/')
                  ? 'bg-zinc-100 text-zinc-900 font-medium'
                  : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
