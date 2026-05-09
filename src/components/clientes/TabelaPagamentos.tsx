"use client";

import { useState } from "react";
import type { PagamentoRow } from "@/lib/clientes";

type Props = {
  pagamentos: PagamentoRow[];
};

export default function TabelaPagamentos({ pagamentos }: Props) {
  const [mostrarTodos, setMostrarTodos] = useState(false);
  
  // Mostra apenas os primeiros 5 ou todos
  const pagamentosVisiveis = mostrarTodos ? pagamentos : pagamentos.slice(0, 5);
  const temMais = pagamentos.length > 5;

  if (pagamentos.length === 0) {
    return null;
  }

  // Calcular total gasto
  const totalGasto = pagamentos.reduce((acc, p) => {
    const valor = parseFloat(p.valor || "0");
    return acc + valor;
  }, 0);

  return (
    <div className="border-t">
      {/* Header */}
      <div className="px-3 py-2 border-b bg-zinc-50 flex items-center justify-between text-xs font-medium text-zinc-700">
        <span>
          Histórico de pagamentos
          <span className="font-normal text-zinc-500 ml-1">
            ({pagamentos.length} registro{pagamentos.length !== 1 ? 's' : ''})
          </span>
        </span>
        <span className="font-semibold text-zinc-900">
          Total: R$ {totalGasto.toFixed(2)}
        </span>
      </div>

      <div className="overflow-auto">
        <table className="min-w-full text-xs">
          <thead className="text-zinc-600 bg-zinc-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Data</th>
              <th className="px-3 py-2 text-left font-medium">Compra</th>
              <th className="px-3 py-2 text-left font-medium">Forma</th>
              <th className="px-3 py-2 text-right font-medium">Valor</th>
              <th className="px-3 py-2 text-left font-medium">Detalhes</th>
              <th className="px-3 py-2 text-left font-medium">Tipo</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-zinc-100">
            {pagamentosVisiveis.map((p) => (
              <tr key={p.id} className="hover:bg-zinc-50">
                <td className="px-3 py-2 font-medium text-zinc-900">
                  {p.data_pgto ? new Date(p.data_pgto).toLocaleDateString('pt-BR') : "—"}
                </td>
                <td className="px-3 py-2 text-zinc-700">{p.compra ?? "—"}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                    {p.forma ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-semibold text-zinc-900">
                  {p.valor ? `R$ ${parseFloat(p.valor).toFixed(2)}` : "—"}
                </td>
                <td className="px-3 py-2 text-zinc-600">{p.detalhes ?? "—"}</td>
                <td className="px-3 py-2 text-zinc-600">{p.tipo ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {temMais && (
        <div className="px-3 py-2 border-t bg-zinc-50 flex justify-center">
          <button
            onClick={() => setMostrarTodos(!mostrarTodos)}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
          >
            {mostrarTodos
              ? `← Ver menos`
              : `Ver todos os ${pagamentos.length} pagamentos →`
            }
          </button>
        </div>
      )}
    </div>
  );
}