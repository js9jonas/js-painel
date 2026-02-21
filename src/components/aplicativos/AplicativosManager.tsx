// src/components/aplicativos/AplicativosManager.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAplicativo } from "@/app/actions/aplicativos";
import AplicativoModal from "./AplicativoModal";
import type { AplicativoRow, AppRow } from "@/lib/aplicativos";

type Props = {
  idCliente: string;
  aplicativos: AplicativoRow[];
  apps: AppRow[];
};

function statusBadge(status: string | null) {
  switch ((status ?? "").toLowerCase()) {
    case "ativo":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20";
    case "inativo":
    case "expirado":
      return "bg-red-50 text-red-700 ring-1 ring-red-600/20";
    case "bloqueado":
      return "bg-orange-50 text-orange-700 ring-1 ring-orange-600/20";
    default:
      return "bg-zinc-100 text-zinc-600";
  }
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return d.split("T")[0].split("-").reverse().join("/");
}

function isVencido(validade: string | null) {
  if (!validade) return false;
  return new Date(validade) < new Date();
}

export default function AplicativosManager({ idCliente, aplicativos, apps }: Props) {
  const [modalApp, setModalApp] = useState<AplicativoRow | null | "novo">(null);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId]  = useState<number | null>(null);
  const router = useRouter();

  function handleDelete(id_app_registro: number) {
    if (!confirm("Remover este aplicativo do cliente?")) return;
    setDeletingId(id_app_registro);
    startTransition(async () => {
      try {
        await deleteAplicativo(id_app_registro, idCliente);
        router.refresh();
      } finally {
        setDeletingId(null);
      }
    });
  }

  return (
    <div className="rounded-2xl border bg-white overflow-hidden">
      {/* Header da seção */}
      <div className="px-4 py-3 border-b bg-zinc-50 flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-zinc-700">📱 Aplicativos</span>
          <span className="ml-2 text-xs text-zinc-400">
            {aplicativos.length} registro{aplicativos.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setModalApp("novo")}
          className="h-8 rounded-xl bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 transition-all"
        >
          + Adicionar
        </button>
      </div>

      {aplicativos.length === 0 ? (
        <div className="px-4 py-10 text-center text-zinc-400 text-sm">
          Nenhum aplicativo vinculado
        </div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b border-zinc-100">
              <tr>
                {["App", "Status", "Validade", "MAC", "Chave", "Obs.", ""].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {aplicativos.map((a) => (
                <tr key={a.id_app_registro} className="hover:bg-zinc-50/50 transition-colors">
                  {/* App */}
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-900">
                      {a.nome_app ?? `App #${a.id_app}`}
                    </div>
                    {a.exige_licenca && (
                      <div className="text-xs text-amber-600 mt-0.5">🔑 Exige licença</div>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium ${statusBadge(a.status)}`}>
                      {a.status ?? "—"}
                    </span>
                  </td>

                  {/* Validade */}
                  <td className="px-4 py-3">
                    <span className={isVencido(a.validade) ? "text-red-600 font-medium" : "text-zinc-700"}>
                      {formatDate(a.validade)}
                      {isVencido(a.validade) && (
                        <span className="ml-1 text-xs">⚠️</span>
                      )}
                    </span>
                  </td>

                  {/* MAC */}
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-zinc-600">
                      {a.mac ?? "—"}
                    </span>
                  </td>

                  {/* Chave */}
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-zinc-600">
                      {a.chave ?? "—"}
                    </span>
                  </td>

                  {/* Observação */}
                  <td className="px-4 py-3 max-w-[160px]">
                    <span
                      className="text-xs text-zinc-500 truncate block"
                      title={a.observacao ?? ""}
                    >
                      {a.observacao || "—"}
                    </span>
                  </td>

                  {/* Ações */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setModalApp(a)}
                        className="h-8 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium hover:bg-zinc-50 transition-colors"
                      >
                        ✏️ Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(a.id_app_registro)}
                        disabled={isPending && deletingId === a.id_app_registro}
                        className="h-8 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalApp !== null && (
        <AplicativoModal
          idCliente={idCliente}
          aplicativo={modalApp === "novo" ? null : modalApp}
          apps={apps}
          onClose={() => setModalApp(null)}
          onSaved={() => {
            router.refresh();
            setModalApp(null);
          }}
        />
      )}
    </div>
  );
}
