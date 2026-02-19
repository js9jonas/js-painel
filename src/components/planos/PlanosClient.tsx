// src/components/planos/PlanosClient.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanoRow } from "@/lib/planos";
import PlanoModal from "./PlanoModal";

type Props = { planos: PlanoRow[] };

function formatValor(v: string | null) {
  if (!v) return "—";
  const n = parseFloat(v);
  return isNaN(n) ? v : `R$ ${n.toFixed(2).replace(".", ",")}`;
}

export default function PlanosClient({ planos }: Props) {
  const [modalPlano, setModalPlano] = useState<PlanoRow | null | "novo">(null);
  const router = useRouter();

  function handleSaved() {
    router.refresh();
    setModalPlano(null);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">Planos</h1>
          <p className="text-sm text-zinc-600 mt-1">
            Gerencie os planos de assinatura
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-2xl font-bold text-zinc-900">{planos.length}</p>
            <p className="text-xs text-zinc-500">Total de planos</p>
          </div>
          <button
            onClick={() => setModalPlano("novo")}
            className="h-10 rounded-xl bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 transition-all shadow-sm"
          >
            + Novo plano
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-gradient-to-b from-zinc-50 to-white">
              {["ID", "Tipo", "Telas", "Meses", "Valor", "Descrição", ""].map((h) => (
                <th
                  key={h}
                  className="px-6 py-4 text-left text-xs font-semibold text-zinc-700 uppercase tracking-wider"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {planos.map((p) => (
              <tr key={p.id_plano} className="hover:bg-zinc-50/50 transition-colors">
                <td className="px-6 py-4 text-zinc-400 text-xs font-mono">
                  {p.id_plano}
                </td>
                <td className="px-6 py-4">
                  <span className="font-semibold text-zinc-900">{p.tipo ?? "—"}</span>
                </td>
                <td className="px-6 py-4">
                  {p.telas != null ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 ring-1 ring-blue-600/20">
                      {p.telas} tela{p.telas !== 1 ? "s" : ""}
                    </span>
                  ) : (
                    <span className="text-zinc-400 text-xs">—</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {p.meses != null ? (
                    <span className="text-zinc-700">
                      {p.meses} {p.meses === 1 ? "mês" : "meses"}
                    </span>
                  ) : (
                    <span className="text-zinc-400 text-xs">—</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <span className="font-semibold text-emerald-700">
                    {formatValor(p.valor)}
                  </span>
                </td>
                <td className="px-6 py-4 max-w-xs">
                  <span
                    className="text-zinc-600 text-xs truncate block"
                    title={p.descricao ?? ""}
                  >
                    {p.descricao || "—"}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button
                    onClick={() => setModalPlano(p)}
                    className="h-8 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium hover:bg-zinc-50 transition-colors"
                  >
                    ✏️ Editar
                  </button>
                </td>
              </tr>
            ))}

            {planos.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-16 text-center text-zinc-500">
                  <div className="flex flex-col items-center gap-2">
                    <div className="text-4xl">📋</div>
                    <div className="font-medium">Nenhum plano cadastrado</div>
                    <button
                      onClick={() => setModalPlano("novo")}
                      className="mt-2 text-sm text-zinc-900 underline hover:no-underline"
                    >
                      Criar o primeiro plano
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalPlano !== null && (
        <PlanoModal
          plano={modalPlano === "novo" ? null : modalPlano}
          onClose={() => setModalPlano(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
