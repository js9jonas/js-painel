"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { definirParceiro } from "@/app/actions/indicacoes";
import type { ClienteRow } from "@/lib/clientes";

type Props = {
  idCliente: string;
  parceiro: { id_parceiro: string; nome_parceiro: string | null } | null;
};

export default function IndicadorInfo({ idCliente, parceiro }: Props) {
  const [buscando, setBuscando] = useState(false);
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<ClienteRow[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function buscarClientes(termo: string) {
    if (termo.trim().length < 2) { setResultados([]); setDropdownOpen(false); return; }
    const res = await fetch(`/api/clientes?q=${encodeURIComponent(termo)}&limit=10`);
    if (res.ok) {
      const data: ClienteRow[] = await res.json();
      setResultados(data);
      setDropdownOpen(data.length > 0);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setBusca(e.target.value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => buscarClientes(e.target.value), 300);
  }

  async function handleSelecionar(c: ClienteRow) {
    setDropdownOpen(false);
    setSalvando(true);
    await definirParceiro(idCliente, c.id_cliente);
    setSalvando(false);
    setBuscando(false);
    setBusca("");
  }

  if (parceiro) {
    return (
      <div className="text-sm text-zinc-500">
        Indicado por:{" "}
        <Link
          href={`/clientes/${parceiro.id_parceiro}`}
          className="font-medium text-zinc-800 hover:underline"
        >
          {parceiro.nome_parceiro ?? `#${parceiro.id_parceiro}`}
        </Link>
      </div>
    );
  }

  if (!buscando) {
    return (
      <button
        onClick={() => setBuscando(true)}
        className="text-xs text-zinc-400 hover:text-zinc-600 underline"
      >
        + adicionar indicador
      </button>
    );
  }

  return (
    <div className="relative flex items-center gap-2">
      <div className="relative">
        <input
          autoFocus
          type="text"
          value={busca}
          onChange={handleChange}
          onBlur={() => setTimeout(() => setDropdownOpen(false), 150)}
          placeholder="Buscar cliente..."
          className="h-7 w-48 rounded-lg border border-zinc-200 px-2 text-xs outline-none focus:border-zinc-400"
        />
        {dropdownOpen && resultados.length > 0 && (
          <div className="absolute z-10 mt-1 w-64 rounded-lg border border-zinc-200 bg-white shadow-lg max-h-48 overflow-y-auto">
            {resultados.map((c) => (
              <button
                key={c.id_cliente}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelecionar(c); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-zinc-50 text-left border-b border-zinc-100 last:border-0"
              >
                <span className="text-zinc-400 font-mono">#{c.id_cliente}</span>
                <span className="text-zinc-900 truncate">{c.nome ?? "Sem nome"}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={() => { setBuscando(false); setBusca(""); setResultados([]); }}
        className="text-xs text-zinc-400 hover:text-zinc-600"
      >
        cancelar
      </button>
      {salvando && <span className="text-xs text-zinc-400">salvando...</span>}
    </div>
  );
}