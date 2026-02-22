// src/components/pagamentos/PagamentoModal.tsx
"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { updatePagamento } from "@/app/actions/pagamentos";
import { buscarClientes, type ClienteBuscaRow } from "@/app/actions/buscarClientes";
import type { PagamentoFullRow } from "@/lib/pagamentos";

type Props = {
  pagamento: PagamentoFullRow;
  onClose: () => void;
  onSaved: () => void;
};

export default function PagamentoModal({ pagamento, onClose, onSaved }: Props) {
  const rawDate = pagamento.data_pgto?.split("T")[0] ?? "";

  // Campos do pagamento
  const [dataPgto, setDataPgto] = useState(rawDate);
  const [forma, setForma] = useState(pagamento.forma ?? "");
  const [valor, setValor] = useState(pagamento.valor ?? "");
  const [detalhes, setDetalhes] = useState(pagamento.detalhes ?? "");
  const [tipo, setTipo] = useState(pagamento.tipo ?? "");
  const [compra, setCompra] = useState(pagamento.compra ?? "");

  // Estado do cliente selecionado
  const [clienteId, setClienteId] = useState(pagamento.id_cliente ?? "");
  const [clienteNome, setClienteNome] = useState(pagamento.nome_cliente ?? "");

  // Busca de cliente
  const [busca, setBusca] = useState(pagamento.nome_cliente ?? "");
  const [resultados, setResultados] = useState<ClienteBuscaRow[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [itemAtivo, setItemAtivo] = useState(-1);
  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownAberto(false);

      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Debounce na busca
  function handleBuscaChange(valor: string) {
    setBusca(valor);
    setItemAtivo(-1);
    setDropdownAberto(true);

    // Se limpou o campo, limpa o cliente selecionado
    if (!valor.trim()) {
      setClienteId("");
      setClienteNome("");
      setResultados([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const rows = await buscarClientes(valor);
        setResultados(rows);
      } finally {
        setBuscando(false);
      }
    }, 300);
  }

  function selecionarCliente(c: ClienteBuscaRow) {
    setClienteId(c.id_cliente);
    setClienteNome(c.nome);
    setBusca(c.nome);
    setResultados([]);
    setDropdownAberto(false);
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
      if (itemAtivo >= 0 && resultados[itemAtivo]) selecionarCliente(resultados[itemAtivo]);
    } else if (e.key === "Escape") {
      setDropdownAberto(false);
      setItemAtivo(-1);
    }
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await updatePagamento(pagamento.id, {
          id_cliente: clienteId || null,
          nome_cliente: clienteNome || null,
          data_pgto: dataPgto,
          forma,
          valor,
          detalhes,
          tipo,
          compra,
        });
        onSaved();
        onClose();
      } catch {
        setError("Erro ao salvar. Tente novamente.");
      }
    });
  }

  const inputClass =
    "w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">

        <div className="mb-5">
          <h2 className="text-lg font-bold text-zinc-900">Editar Pagamento</h2>
          <p className="text-sm text-zinc-500 mt-0.5">ID: {pagamento.id}</p>
        </div>

        <div className="space-y-4">

          {/* Busca de Cliente */}
          <div ref={dropdownRef} className="relative">
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
              Cliente
            </label>
            <input
              onKeyDown={handleKeyDown}
              value={busca}
              onChange={(e) => handleBuscaChange(e.target.value)}
              onFocus={() => busca && setDropdownAberto(true)}
              className={inputClass}
              placeholder="🔍 Buscar cliente pelo nome..."
              autoComplete="off"
            />

            {/* Indicador de cliente selecionado */}
            {clienteId && clienteNome === busca && (
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-xs text-emerald-700 bg-emerald-50 rounded-lg px-2.5 py-1 font-medium">
                  ✓ ID {clienteId} — {clienteNome}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setClienteId("");
                    setClienteNome("");
                    setBusca("");
                  }}
                  className="text-xs text-zinc-400 hover:text-zinc-600"
                >
                  ✕ limpar
                </button>
              </div>
            )}

            {/* Dropdown de resultados */}
            {dropdownAberto && (busca.trim().length > 0) && (
              <div className="absolute z-20 mt-1 w-full rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden">
                {buscando ? (
                  <div className="px-4 py-3 text-sm text-zinc-500">Buscando...</div>
                ) : resultados.length > 0 ? (
                  <ul>
                    {resultados.map((c, i) => (
                      <li key={c.id_cliente}>
                        <button
                          type="button"
                          onMouseDown={() => selecionarCliente(c)}
                          onMouseEnter={() => setItemAtivo(i)}
                          className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center justify-between gap-3 ${i === itemAtivo ? "bg-zinc-900 text-white" : "hover:bg-zinc-50"
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
                  <div className="px-4 py-3 text-sm text-zinc-400">
                    Nenhum cliente encontrado
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Data e Valor */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Data</label>
              <input
                type="date"
                value={dataPgto}
                onChange={(e) => setDataPgto(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Valor (R$)</label>
              <input
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className={inputClass}
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Forma e Tipo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Forma</label>
              <input
                value={forma}
                onChange={(e) => setForma(e.target.value)}
                className={inputClass}
                placeholder="PIX, Dinheiro..."
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Tipo</label>
              <input
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className={inputClass}
                placeholder="Tipo..."
              />
            </div>
          </div>

          {/* Compra */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
              Compra / Referência
            </label>
            <input
              value={compra}
              onChange={(e) => setCompra(e.target.value)}
              className={inputClass}
              placeholder="Referência da compra..."
            />
          </div>

          {/* Detalhes */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Detalhes</label>
            <textarea
              value={detalhes}
              onChange={(e) => setDetalhes(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all resize-none"
              placeholder="Detalhes adicionais..."
            />
          </div>

        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="h-10 rounded-xl border border-zinc-300 px-5 text-sm font-medium hover:bg-zinc-50 transition-all disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="h-10 rounded-xl bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isPending ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}
