// src/components/clientes/BuscaClienteRapida.tsx
"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { buscarClientes, type ClienteBuscaRow } from "@/app/actions/buscarClientes";

export default function BuscaClienteRapida() {
  const [busca, setBusca]                   = useState("");
  const [resultados, setResultados]         = useState<ClienteBuscaRow[]>([]);
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const [buscando, setBuscando]             = useState(false);
  const [itemAtivo, setItemAtivo]           = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  function handleChange(valor: string) {
    setBusca(valor);
    setItemAtivo(-1);
    setDropdownAberto(true);
    if (!valor.trim()) { setResultados([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setBuscando(true);
      try { setResultados(await buscarClientes(valor)); }
      finally { setBuscando(false); }
    }, 300);
  }

  function navegar(c: ClienteBuscaRow) {
    setBusca("");
    setResultados([]);
    setDropdownAberto(false);
    setItemAtivo(-1);
    router.push(`/clientes/${c.id_cliente}`);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!dropdownAberto || resultados.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setItemAtivo((prev) => Math.min(prev + 1, resultados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setItemAtivo((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (itemAtivo >= 0 && resultados[itemAtivo]) {
        navegar(resultados[itemAtivo]);
      }
    } else if (e.key === "Escape") {
      setDropdownAberto(false);
      setItemAtivo(-1);
    }
  }

  return (
    <div className="relative w-full max-w-sm">
      <input
        value={busca}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => busca && setDropdownAberto(true)}
        onBlur={() => setTimeout(() => setDropdownAberto(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder="🔍 Buscar outro cliente..."
        className="h-9 w-full rounded-xl border border-zinc-300 bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
        autoComplete="off"
      />

      {dropdownAberto && busca.trim().length > 0 && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden">
          {buscando ? (
            <div className="px-4 py-3 text-sm text-zinc-400">Buscando...</div>
          ) : resultados.length > 0 ? (
            <ul className="max-h-64 overflow-y-auto">
              {resultados.map((c, i) => (
                <li key={c.id_cliente}>
                  <button
                    type="button"
                    onMouseDown={() => navegar(c)}
                    onMouseEnter={() => setItemAtivo(i)}
                    className={`w-full text-left px-4 py-2.5 text-sm flex items-center justify-between gap-3 transition-colors ${
                      i === itemAtivo ? "bg-zinc-900 text-white" : "hover:bg-zinc-50 text-zinc-900"
                    }`}
                  >
                    <span className="font-medium">{c.nome}</span>
                    <span className={`text-xs shrink-0 ${i === itemAtivo ? "text-zinc-300" : "text-zinc-400"}`}>
                      ID {c.id_cliente}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-3 text-sm text-zinc-400">Nenhum cliente encontrado</div>
          )}
        </div>
      )}
    </div>
  );
}