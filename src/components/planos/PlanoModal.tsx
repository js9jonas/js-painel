// src/components/planos/PlanoModal.tsx
"use client";

import { useState, useTransition } from "react";
import { createPlano, updatePlano } from "@/app/actions/planos";
import type { PlanoRow } from "@/lib/planos";

type Props = {
  plano?: PlanoRow | null;
  onClose: () => void;
  onSaved: () => void;
};

export default function PlanoModal({ plano, onClose, onSaved }: Props) {
  const isEdit = !!plano;

  const [tipo, setTipo] = useState(plano?.tipo ?? "");
  const [telas, setTelas] = useState(String(plano?.telas ?? ""));
  const [meses, setMeses] = useState(String(plano?.meses ?? ""));
  const [valor, setValor] = useState(plano?.valor ?? "");
  const [descricao, setDescricao] = useState(plano?.descricao ?? "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (!tipo.trim()) { setError("Tipo é obrigatório"); return; }
    setError(null);

    startTransition(async () => {
      try {
        const data = {
          tipo: tipo.trim(),
          telas: parseInt(telas) || 0,
          meses: parseInt(meses) || 0,
          valor: valor.trim(),
          descricao: descricao.trim(),
        };

        if (isEdit && plano?.id_plano) {
          await updatePlano(plano.id_plano, data);
        } else {
          await createPlano(data);
        }

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
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-zinc-900">
            {isEdit ? "Editar Plano" : "Novo Plano"}
          </h2>
          {isEdit && (
            <p className="text-sm text-zinc-500 mt-0.5">ID: {plano!.id_plano}</p>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
              Tipo *
            </label>
            <input
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className={inputClass}
              placeholder="Ex: Mensal, Trimestral, Semestral..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Telas
              </label>
              <input
                type="number"
                min="0"
                value={telas}
                onChange={(e) => setTelas(e.target.value)}
                className={inputClass}
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Meses
              </label>
              <input
                type="number"
                min="0"
                value={meses}
                onChange={(e) => setMeses(e.target.value)}
                className={inputClass}
                placeholder="0"
              />
            </div>
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

          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
              Descrição
            </label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all resize-none"
              placeholder="Descrição do plano..."
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
            disabled={isPending || !tipo.trim()}
            className="h-10 rounded-xl bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isPending ? "Salvando..." : isEdit ? "Salvar alterações" : "Criar plano"}
          </button>
        </div>
      </div>
    </div>
  );
}
