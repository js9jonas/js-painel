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
    <div className="rounded-2xl border bg-white overflow-hidden shadow-sm">
      {/* Header com estatísticas */}
      <div className="px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Histórico de Pagamentos</h3>
            <p className="text-xs text-zinc-600 mt-0.5">
              {pagamentos.length} pagamento{pagamentos.length !== 1 ? 's' : ''} registrado{pagamentos.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-blue-700">
              R$ {totalGasto.toFixed(2)}
            </div>
            <div className="text-xs text-zinc-600">Total gasto</div>
          </div>
        </div>
      </div>

      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="text-zinc-600 bg-zinc-50">
            <tr>
              <th className="px-6 py-3 text-left font-medium text-xs uppercase tracking-wider">Data</th>
              <th className="px-6 py-3 text-left font-medium text-xs uppercase tracking-wider">Compra</th>
              <th className="px-6 py-3 text-left font-medium text-xs uppercase tracking-wider">Forma</th>
              <th className="px-6 py-3 text-right font-medium text-xs uppercase tracking-wider">Valor</th>
              <th className="px-6 py-3 text-left font-medium text-xs uppercase tracking-wider">Detalhes</th>
              <th className="px-6 py-3 text-left font-medium text-xs uppercase tracking-wider">Tipo</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-zinc-100">
            {pagamentosVisiveis.map((p) => (
              <tr key={p.id} className="hover:bg-zinc-50/50 transition-colors">
                <td className="px-6 py-4 font-medium text-zinc-900">
                  {p.data_pgto ? new Date(p.data_pgto).toLocaleDateString('pt-BR') : "—"}
                </td>
                <td className="px-6 py-4 text-zinc-700">{p.compra ?? "—"}</td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 ring-1 ring-blue-600/20">
                    {p.forma ?? "—"}
                  </span>
                </td>
                <td className="px-6 py-4 text-right font-semibold text-zinc-900">
                  {p.valor ? `R$ ${parseFloat(p.valor).toFixed(2)}` : "—"}
                </td>
                <td className="px-6 py-4 text-zinc-600">{p.detalhes ?? "—"}</td>
                <td className="px-6 py-4 text-zinc-600 text-xs">{p.tipo ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Botão Ver todos/Ver menos */}
      {temMais && (
        <div className="px-6 py-4 border-t bg-zinc-50 flex justify-center">
          <button
            onClick={() => setMostrarTodos(!mostrarTodos)}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline transition-colors"
          >
            {mostrarTodos 
              ? `← Ver menos (mostrando ${pagamentos.length})` 
              : `Ver todos os ${pagamentos.length} pagamentos →`
            }
          </button>
        </div>
      )}
    </div>
  );
}