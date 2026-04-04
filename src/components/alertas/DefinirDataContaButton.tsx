"use client";

import { useRef, useState, useEffect, useTransition } from "react";
import { definirDataConta } from "@/app/actions/definirDataConta";

interface Props {
  idAssinatura: string;
  vencContas: string; // formato YYYY-MM-DD ou ISO
}

function somarDias(dataISO: string, dias: number): string {
  const d = new Date(dataISO.split("T")[0] + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

export default function DefinirDataContaButton({ idAssinatura, vencContas }: Props) {
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Ao abrir o modal, pré-preenche com venc_contas + 31 dias
  useEffect(() => {
    if (aberto) {
      setData(somarDias(vencContas, 31));
      // Foca o input após render
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [aberto, vencContas]);

  function confirmar() {
    if (!data) return;
    startTransition(async () => {
      await definirDataConta(idAssinatura, data);
      setAberto(false);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") confirmar();
    if (e.key === "Escape") setAberto(false);
  }

  return (
    <>
      {/* Botão de abertura */}
      <button
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium
                   bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200
                   transition-colors whitespace-nowrap"
      >
        📅 31 / outra data
      </button>

      {/* Overlay + Modal */}
      {aberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAberto(false);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-xl border border-zinc-200 w-80 overflow-hidden"
            onKeyDown={handleKeyDown}
          >
            {/* Cabeçalho */}
            <div className="px-5 py-4 border-b border-zinc-100 bg-violet-50">
              <p className="text-sm font-semibold text-violet-900">📅 Definir nova data</p>
              <p className="text-xs text-violet-600 mt-0.5">
                Padrão: +31 dias • ajuste se necessário
              </p>
            </div>

            {/* Corpo */}
            <div className="px-5 py-4 space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
                  Nova data de vencimento
                </label>
                <input
                  ref={inputRef}
                  type="date"
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm
                             text-zinc-900 focus:outline-none focus:ring-2 focus:ring-violet-400
                             focus:border-violet-400"
                />
              </div>
              <p className="text-xs text-zinc-400">
                Pressione <kbd className="bg-zinc-100 border border-zinc-300 rounded px-1 py-0.5 font-mono text-xs">Enter</kbd> para confirmar ou{" "}
                <kbd className="bg-zinc-100 border border-zinc-300 rounded px-1 py-0.5 font-mono text-xs">Esc</kbd> para cancelar.
              </p>
            </div>

            {/* Rodapé */}
            <div className="px-5 py-3 bg-zinc-50 border-t border-zinc-100 flex justify-end gap-2">
              <button
                onClick={() => setAberto(false)}
                disabled={isPending}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600
                           hover:bg-zinc-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmar}
                disabled={isPending || !data}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-violet-600
                           text-white hover:bg-violet-700 disabled:opacity-50
                           transition-colors flex items-center gap-1.5"
              >
                {isPending ? (
                  <>
                    <span className="h-3 w-3 rounded-full border-2 border-white/30
                                     border-t-white animate-spin" />
                    Salvando…
                  </>
                ) : (
                  "Confirmar"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}