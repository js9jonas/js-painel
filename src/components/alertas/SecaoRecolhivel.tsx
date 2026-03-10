"use client";

// src/components/alertas/SecaoRecolhivel.tsx
import { useState } from "react";

type Props = {
  header: React.ReactNode;
  children: React.ReactNode;
  defaultAberto?: boolean;
};

export default function SecaoRecolhivel({ header, children, defaultAberto = true }: Props) {
  const [aberto, setAberto] = useState(defaultAberto);

  return (
    <div className="rounded-2xl border bg-white overflow-hidden shadow-sm">
      <div className="flex items-center border-b">
        <div className="flex-1">{header}</div>
        <button
          onClick={() => setAberto((v) => !v)}
          className="px-4 py-4 shrink-0 text-zinc-400 hover:text-zinc-600 transition"
          title={aberto ? "Recolher" : "Expandir"}
        >
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${aberto ? "rotate-0" : "-rotate-90"}`}
            fill="none" viewBox="0 0 16 16"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {aberto && <>{children}</>}
    </div>
  );
}