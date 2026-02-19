// src/components/clientes/EditClienteModal.tsx
"use client";

import { useState, useTransition } from "react";
import { updateCliente } from "@/app/actions/clientes";

type Props = {
  idCliente: string;
  nomeAtual: string;
  observacaoAtual: string | null;
  onClose: () => void;
  onSaved: () => void;
};

export default function EditClienteModal({
  idCliente,
  nomeAtual,
  observacaoAtual,
  onClose,
  onSaved,
}: Props) {
  const [nome, setNome] = useState(nomeAtual);
  const [observacao, setObservacao] = useState(observacaoAtual ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (!nome.trim()) {
      setError("Nome é obrigatório");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await updateCliente(idCliente, {
          nome: nome.trim(),
          observacao: observacao.trim() || null,
        });
        onSaved();
        onClose();
      } catch {
        setError("Erro ao salvar. Tente novamente.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-zinc-900">Editar Cliente</h2>
          <p className="text-sm text-zinc-500 mt-0.5">ID: {idCliente}</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
              Nome *
            </label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all"
              placeholder="Nome do cliente"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
              Observação
            </label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all resize-none"
              placeholder="Observações sobre o cliente..."
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
            disabled={isPending || !nome.trim()}
            className="h-10 rounded-xl bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isPending ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}
