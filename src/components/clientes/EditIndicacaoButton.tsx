"use client";

import { useState, useTransition } from "react";
import { editarBonificacao, removerIndicacao } from "@/app/actions/indicacoes";

type Bonificacao = "aberta" | "cortesia" | "comissao";

const BADGE_STYLE: Record<Bonificacao, string> = {
  aberta:   "bg-amber-50 text-amber-700 border-amber-200",
  cortesia: "bg-blue-50 text-blue-700 border-blue-200",
  comissao: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const BONIFICACAO_ACTIVE: Record<Bonificacao, string> = {
  aberta:   "border-amber-300 bg-amber-50 text-amber-700",
  cortesia: "border-blue-300 bg-blue-50 text-blue-700",
  comissao: "border-emerald-300 bg-emerald-50 text-emerald-700",
};

type Props = {
  id_indicacao: string;
  bonificacao: Bonificacao;
  idParceiro: string;
};

export default function EditIndicacaoButton({ id_indicacao, bonificacao, idParceiro }: Props) {
  const [open, setOpen] = useState(false);
  const [valor, setValor] = useState<Bonificacao>(bonificacao);
  const [isPending, startTransition] = useTransition();

  function handleSalvar() {
    startTransition(async () => {
      await editarBonificacao(id_indicacao, valor, idParceiro);
      setOpen(false);
    });
  }

  function handleRemover() {
    if (!confirm("Remover esta indicação?")) return;
    startTransition(async () => {
      await removerIndicacao(id_indicacao, idParceiro);
    });
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setOpen(true)}
          className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border capitalize hover:opacity-80 transition-opacity ${BADGE_STYLE[bonificacao]}`}
        >
          {bonificacao}
        </button>

        <button
          onClick={() => setOpen(true)}
          title="Editar bonificação"
          className="rounded-md p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15.232 5.232l3.536 3.536M9 13l6.293-6.293a1 1 0 011.414 0l1.586 1.586a1 1 0 010 1.414L12 16H9v-3z" />
          </svg>
        </button>

        <button
          onClick={handleRemover}
          disabled={isPending}
          title="Remover indicação"
          className="rounded-md p-1 text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4h6v3M4 7h16" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="relative w-full max-w-xs rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-zinc-900 mb-4">Editar bonificação</h2>

            <div className="flex gap-2 mb-6">
              {(["aberta", "cortesia", "comissao"] as Bonificacao[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setValor(b)}
                  className={`flex-1 rounded-lg border py-2 text-xs font-medium capitalize transition-colors ${
                    valor === b ? BONIFICACAO_ACTIVE[b] : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvar}
                disabled={isPending}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 transition-colors"
              >
                {isPending ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
