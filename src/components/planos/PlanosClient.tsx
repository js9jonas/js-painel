// src/components/planos/PlanosClient.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanoRow } from "@/lib/planos";
import type { PacoteRow } from "@/lib/pacotes";
import PlanoModal from "./PlanoModal";
import PacoteModal from "./PacoteModal";
import type { ServidorRow } from "@/lib/servidores";
import type { ConsumoRow } from "@/lib/consumo_servidor";

type Props = {
  planos: PlanoRow[];
  pacotes: PacoteRow[];
  servidores: ServidorRow[];
  consumos: ConsumoRow[];
};

function formatValor(v: string | null) {
  if (!v) return "—";
  const n = parseFloat(v);
  return isNaN(n) ? v : `R$ ${n.toFixed(2).replace(".", ",")}`;
}

export default function PlanosClient({ planos, pacotes, servidores, consumos }: Props) {
  const [modalPlano, setModalPlano] = useState<PlanoRow | null | "novo">(null);
  const [modalPacote, setModalPacote] = useState<PacoteRow | null | "novo">(null);
  const router = useRouter();

  function handleSaved() {
    router.refresh();
    setModalPlano(null);
    setModalPacote(null);
  }

  return (
    <div className="space-y-10">
      {/* ── PLANOS ── */}
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900">Planos</h1>
            <p className="text-sm text-zinc-600 mt-1">Gerencie os planos de assinatura</p>
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

        <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-gradient-to-b from-zinc-50 to-white">
                {["ID", "Tipo", "Telas", "Meses", "Valor", "Descrição", ""].map((h) => (
                  <th key={h} className="px-6 py-4 text-left text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {planos.map((p) => (
                <tr key={p.id_plano} className="hover:bg-zinc-50/50 transition-colors">
                  <td className="px-6 py-4 text-zinc-400 text-xs font-mono">{p.id_plano}</td>
                  <td className="px-6 py-4"><span className="font-semibold text-zinc-900">{p.tipo ?? "—"}</span></td>
                  <td className="px-6 py-4">
                    {p.telas != null ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 ring-1 ring-blue-600/20">
                        {p.telas} tela{p.telas !== 1 ? "s" : ""}
                      </span>
                    ) : <span className="text-zinc-400 text-xs">—</span>}
                  </td>
                  <td className="px-6 py-4">
                    {p.meses != null ? (
                      <span className="text-zinc-700">{p.meses} {p.meses === 1 ? "mês" : "meses"}</span>
                    ) : <span className="text-zinc-400 text-xs">—</span>}
                  </td>
                  <td className="px-6 py-4"><span className="font-semibold text-emerald-700">{formatValor(p.valor)}</span></td>
                  <td className="px-6 py-4 max-w-xs">
                    <span className="text-zinc-600 text-xs truncate block" title={p.descricao ?? ""}>{p.descricao || "—"}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => setModalPlano(p)} className="h-8 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium hover:bg-zinc-50 transition-colors">
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
                      <button onClick={() => setModalPlano("novo")} className="mt-2 text-sm text-zinc-900 underline hover:no-underline">
                        Criar o primeiro plano
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── PACOTES ── */}
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-3xl font-bold text-zinc-900">Pacotes</h2>
            <p className="text-sm text-zinc-600 mt-1">Aplicativos e players disponíveis</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-2xl font-bold text-zinc-900">{pacotes.length}</p>
              <p className="text-xs text-zinc-500">Total de pacotes</p>
            </div>
            <button
              onClick={() => setModalPacote("novo")}
              className="h-10 rounded-xl bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 transition-all shadow-sm"
            >
              + Novo pacote
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-gradient-to-b from-zinc-50 to-white">
                {["ID", "Pacote", "Telas", ""].map((h) => (
                  <th key={h} className="px-6 py-4 text-left text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {pacotes.map((p) => (
                <tr key={p.id_pacote} className="hover:bg-zinc-50/50 transition-colors">
                  <td className="px-6 py-4 text-zinc-400 text-xs font-mono">{p.id_pacote}</td>
                  <td className="px-6 py-4"><span className="font-semibold text-zinc-900">{p.contrato}</span></td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 ring-1 ring-blue-600/20">
                      {p.telas} tela{p.telas !== 1 ? "s" : ""}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => setModalPacote(p)} className="h-8 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium hover:bg-zinc-50 transition-colors">
                      ✏️ Editar
                    </button>
                  </td>
                </tr>
              ))}
              {pacotes.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center text-zinc-500">
                    <div className="flex flex-col items-center gap-2">
                      <div className="text-4xl">📦</div>
                      <div className="font-medium">Nenhum pacote cadastrado</div>
                      <button onClick={() => setModalPacote("novo")} className="mt-2 text-sm text-zinc-900 underline hover:no-underline">
                        Criar o primeiro pacote
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modais */}
      {modalPlano !== null && (
        <PlanoModal
          plano={modalPlano === "novo" ? null : modalPlano}
          onClose={() => setModalPlano(null)}
          onSaved={handleSaved}
        />
      )}
      {modalPacote !== null && (
        <PacoteModal
          pacote={modalPacote === "novo" ? null : modalPacote}
          servidores={servidores}
          consumos={
            modalPacote === "novo"
              ? []
              : consumos.filter((c) => c.id_pacote === modalPacote.id_pacote)
          }
          onClose={() => setModalPacote(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}