"use client";

import { useState, useTransition } from "react";
import { atualizarBonificacoes } from "@/app/actions/indicacoes";
import type { IndicacaoRow } from "@/lib/indicacoes";

type Bonificacao = "aberta" | "cortesia" | "comissao";

const STYLES: Record<Bonificacao, string> = {
  aberta:   "border-amber-300 bg-amber-50 text-amber-700",
  cortesia: "border-blue-300 bg-blue-50 text-blue-700",
  comissao: "border-emerald-300 bg-emerald-50 text-emerald-700",
};

const INACTIVE: string = "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300";

type Props = {
  idParceiro: string;
  indicacoes: IndicacaoRow[];
};

export default function DefinirIndicacoesModal({ idParceiro, indicacoes }: Props) {
  const [open, setOpen] = useState(false);
  const [valores, setValores] = useState<Record<string, Bonificacao>>(() =>
    Object.fromEntries(indicacoes.map((i) => [i.id_indicacao, i.bonificacao]))
  );
  const [isPending, startTransition] = useTransition();

  function handleOpen() {
    // Reseta para valores atuais ao abrir
    setValores(Object.fromEntries(indicacoes.map((i) => [i.id_indicacao, i.bonificacao])));
    setOpen(true);
  }

  function handleSalvar() {
    startTransition(async () => {
      const atualizacoes = Object.entries(valores).map(([id_indicacao, bonificacao]) => ({
        id_indicacao,
        bonificacao,
      }));
      await atualizarBonificacoes(atualizacoes, idParceiro);
      setOpen(false);
    });
  }

  // Aplica o mesmo status para todos
  function handleTodos(bonificacao: Bonificacao) {
    setValores(Object.fromEntries(indicacoes.map((i) => [i.id_indicacao, bonificacao])));
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        Definir indicacoes
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">

            <div className="px-6 pt-6 pb-4 border-b flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Definir indicacoes</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Defina o status de bonificacao de cada indicacao
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Atalho para aplicar todos */}
            <div className="px-6 py-3 border-b bg-zinc-50 flex items-center gap-2">
              <span className="text-xs text-zinc-500 mr-1">Aplicar todos:</span>
              {(["aberta", "cortesia", "comissao"] as Bonificacao[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => handleTodos(b)}
                  className={`rounded-lg border px-3 py-1 text-xs font-medium capitalize transition-colors ${STYLES[b]}`}
                >
                  {b}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 border-b sticky top-0">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500">Cliente</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500">Plano</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500">Status</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500">Bonificacao</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {indicacoes.map((ind) => {
                    const val = valores[ind.id_indicacao] ?? ind.bonificacao;
                    return (
                      <tr key={ind.id_indicacao} className="hover:bg-zinc-50">
                        <td className="px-4 py-3">
                          <div className="font-medium text-zinc-900">
                            {ind.nome_indicado ?? `#${ind.id_indicado}`}
                          </div>
                          {ind.telefone_indicado && (
                            <div className="text-xs text-zinc-400">{ind.telefone_indicado}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-zinc-600 text-xs">
                          {ind.plano_tipo ?? "--"}
                        </td>
                        <td className="px-4 py-3">
                          {ind.status_assinatura ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium capitalize bg-zinc-100 text-zinc-600">
                              {ind.status_assinatura}
                            </span>
                          ) : (
                            <span className="text-zinc-400 text-xs">--</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            {(["aberta", "cortesia", "comissao"] as Bonificacao[]).map((b) => (
                              <button
                                key={b}
                                type="button"
                                onClick={() => setValores((prev) => ({ ...prev, [ind.id_indicacao]: b }))}
                                className={`rounded-lg border px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                                  val === b ? STYLES[b] : INACTIVE
                                }`}
                              >
                                {b}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t flex justify-end gap-2">
              <button onClick={() => setOpen(false)} disabled={isPending}
                className="h-9 rounded-xl border px-4 text-sm hover:bg-zinc-50 disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={handleSalvar} disabled={isPending}
                className="h-9 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50">
                {isPending ? "Salvando..." : "Salvar alteracoes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}