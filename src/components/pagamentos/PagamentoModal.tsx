// src/components/pagamentos/PagamentoModal.tsx
"use client";

import { useState, useTransition } from "react";
import { updatePagamento } from "@/app/actions/pagamentos";
import type { PagamentoFullRow } from "@/lib/pagamentos";

type Props = {
  pagamento: PagamentoFullRow;
  onClose: () => void;
  onSaved: () => void;
};

export default function PagamentoModal({ pagamento, onClose, onSaved }: Props) {
  // data_pgto pode vir como "2025-01-15" ou "2025-01-15T00:00:00.000Z"
  const rawDate = pagamento.data_pgto?.split("T")[0] ?? "";

  const [dataPgto, setDataPgto] = useState(rawDate);
  const [forma, setForma] = useState(pagamento.forma ?? "");
  const [valor, setValor] = useState(pagamento.valor ?? "");
  const [detalhes, setDetalhes] = useState(pagamento.detalhes ?? "");
  const [tipo, setTipo] = useState(pagamento.tipo ?? "");
  const [compra, setCompra] = useState(pagamento.compra ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await updatePagamento(pagamento.id, {
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
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-zinc-900">Editar Pagamento</h2>
          <p className="text-sm text-zinc-500 mt-0.5">
            {pagamento.nome_cliente
              ? `${pagamento.nome_cliente} • `
              : ""}
            ID: {pagamento.id}
          </p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Data
              </label>
              <input
                type="date"
                value={dataPgto}
                onChange={(e) => setDataPgto(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Valor (R$)
              </label>
              <input
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className={inputClass}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Forma
              </label>
              <input
                value={forma}
                onChange={(e) => setForma(e.target.value)}
                className={inputClass}
                placeholder="PIX, Dinheiro..."
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Tipo
              </label>
              <input
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className={inputClass}
                placeholder="Tipo..."
              />
            </div>
          </div>

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

          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
              Detalhes
            </label>
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
          <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {error}
          </p>
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
