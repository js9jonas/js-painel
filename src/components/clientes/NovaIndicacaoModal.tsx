"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { adicionarIndicacao } from "@/app/actions/indicacoes";
import type { ClienteRow } from "@/lib/clientes";

type Bonificacao = "aberta" | "cortesia" | "comissao";

const BONIFICACAO_STYLE: Record<Bonificacao, string> = {
  aberta:   "border-amber-300 bg-amber-50 text-amber-700",
  cortesia: "border-blue-300 bg-blue-50 text-blue-700",
  comissao: "border-emerald-300 bg-emerald-50 text-emerald-700",
};

export default function NovaIndicacaoModal({ idParceiro }: { idParceiro: string }) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<ClienteRow[]>([]);
  const [selecionado, setSelecionado] = useState<ClienteRow | null>(null);
  const [bonificacao, setBonificacao] = useState<Bonificacao>("aberta");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!open) {
      setBusca("");
      setResultados([]);
      setSelecionado(null);
      setBonificacao("aberta");
      setDropdownOpen(false);
    }
  }, [open]);

  async function buscarClientes(termo: string) {
    if (termo.trim().length < 2) {
      setResultados([]);
      setDropdownOpen(false);
      return;
    }
    const res = await fetch(`/api/clientes?q=${encodeURIComponent(termo)}&limit=10`);
    if (res.ok) {
      const data: ClienteRow[] = await res.json();
      setResultados(data);
      setDropdownOpen(data.length > 0);
    }
  }

  function handleBuscaChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setBusca(v);
    setSelecionado(null);
    buscarClientes(v);
  }

  function handleSelecionar(c: ClienteRow) {
    setSelecionado(c);
    setBusca(c.nome ?? c.id_cliente);
    setDropdownOpen(false);
    setResultados([]);
  }

  function handleSubmit() {
    if (!selecionado) return;
    startTransition(async () => {
      await adicionarIndicacao(idParceiro, selecionado.id_cliente, bonificacao);
      setOpen(false);
    });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Adicionar indicação
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <button
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h2 className="text-lg font-semibold text-zinc-900 mb-5">Nova indicação</h2>

            <div className="space-y-4">
              <div ref={dropdownRef} className="relative">
                <label className="block text-xs font-medium text-zinc-500 uppercase mb-1.5">
                  Cliente indicado
                </label>
                <input
                  type="text"
                  value={busca}
                  onChange={handleBuscaChange}
                  placeholder="Buscar por nome ou observação..."
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-2 focus:ring-zinc-100"
                  autoComplete="off"
                />
                {dropdownOpen && resultados.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full rounded-lg border border-zinc-200 bg-white shadow-lg max-h-52 overflow-y-auto">
                    {resultados.map((c) => (
                      <button
                        key={c.id_cliente}
                        type="button"
                        onClick={() => handleSelecionar(c)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-50 text-left"
                      >
                        <span className="text-zinc-400 text-xs font-mono shrink-0">#{c.id_cliente}</span>
                        <span className="text-zinc-900 truncate">{c.nome ?? "Sem nome"}</span>
                        {c.telefone && (
                          <span className="text-zinc-400 text-xs ml-auto shrink-0">{c.telefone}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {selecionado && (
                  <p className="mt-1 text-xs text-emerald-600">
                    ✓ {selecionado.nome ?? `#${selecionado.id_cliente}`} selecionado
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 uppercase mb-1.5">
                  Bonificação
                </label>
                <div className="flex gap-2">
                  {(["aberta", "cortesia", "comissao"] as Bonificacao[]).map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setBonificacao(b)}
                      className={`flex-1 rounded-lg border py-2 text-xs font-medium capitalize transition-colors ${
                        bonificacao === b
                          ? BONIFICACAO_STYLE[b]
                          : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
                      }`}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={!selecionado || isPending}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isPending ? "Salvando..." : "Adicionar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
