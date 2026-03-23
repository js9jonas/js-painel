"use client";

import { useState, useTransition } from "react";
import { createPacote, updatePacote } from "@/app/actions/pacotes";
import { saveConsumos } from "@/app/actions/consumo_servidor";
import type { PacoteRow } from "@/lib/pacotes";
import type { ServidorRow } from "@/lib/servidores";
import type { ConsumoRow } from "@/lib/consumo_servidor";

type Props = {
  pacote?: PacoteRow | null;
  servidores: ServidorRow[];
  consumos: ConsumoRow[]; // já filtrado para este pacote
  onClose: () => void;
  onSaved: () => void;
};

export default function PacoteModal({ pacote, servidores, consumos, onClose, onSaved }: Props) {
  const isEdit = !!pacote;

  const [contrato, setContrato] = useState(pacote?.contrato ?? "");
  const [telas, setTelas] = useState(String(pacote?.telas ?? "1"));

  // mapa id_servidor -> creditos_mensal
  const [creditosMap, setCreditosMap] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const c of consumos) {
      map[c.id_servidor] = String(c.creditos_mensal);
    }
    return map;
  });

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function setCredito(id_servidor: string, value: string) {
    setCreditosMap((prev) => ({ ...prev, [id_servidor]: value }));
  }

  function handleSave() {
    if (!contrato.trim()) { setError("Nome do pacote é obrigatório"); return; }
    const telasNum = parseInt(telas);
    if (!telasNum || telasNum < 1) { setError("Telas deve ser um número válido"); return; }
    setError(null);

    startTransition(async () => {
      try {
        let id_pacote = pacote?.id_pacote;

        if (isEdit && id_pacote) {
          await updatePacote(id_pacote, { contrato: contrato.trim(), telas: telasNum });
        } else {
          id_pacote = await createPacote({ contrato: contrato.trim(), telas: telasNum });
        }

        // salvar consumos
        const entries = servidores.map((s) => ({
          id_servidor: s.id_servidor,
          creditos_mensal: parseInt(creditosMap[s.id_servidor] ?? "0") || 0,
        }));
        await saveConsumos(id_pacote!, entries);

        onSaved();
        onClose();
      } catch {
        setError("Erro ao salvar. Tente novamente.");
      }
    });
  }

  const inputClass =
    "w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all";

  const servidoresAtivos = servidores.filter((s) => s.ativo);
  const servidoresInativos = servidores.filter((s) => !s.ativo);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-zinc-900">
            {isEdit ? "Editar Pacote" : "Novo Pacote"}
          </h2>
          {isEdit && (
            <p className="text-sm text-zinc-500 mt-0.5">ID: {pacote!.id_pacote}</p>
          )}
        </div>

        <div className="space-y-4">
          {/* Dados do pacote */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
              Nome do pacote *
            </label>
            <input
              value={contrato}
              onChange={(e) => setContrato(e.target.value)}
              className={inputClass}
              placeholder="Ex: DuplexPlay, XCIPTV..."
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
              Telas *
            </label>
            <input
              type="number"
              min="1"
              value={telas}
              onChange={(e) => setTelas(e.target.value)}
              className={inputClass}
              placeholder="1"
            />
          </div>

          {/* Consumo por servidor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-zinc-700">
                Créditos por servidor
              </label>
              <span className="text-xs text-zinc-400">0 = não usa</span>
            </div>

            <div className="rounded-xl border border-zinc-200 overflow-hidden">
              {/* Ativos */}
              {servidoresAtivos.map((s, i) => (
                <div
                  key={s.id_servidor}
                  className={`flex items-center gap-3 px-4 py-2.5 ${
                    i < servidoresAtivos.length - 1 || servidoresInativos.length > 0
                      ? "border-b border-zinc-100"
                      : ""
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 truncate">
                      {s.codigo_publico}
                    </p>
                    <p className="text-xs text-zinc-400">{s.nome_interno}</p>
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={creditosMap[s.id_servidor] ?? "0"}
                    onChange={(e) => setCredito(s.id_servidor, e.target.value)}
                    className="w-20 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm text-center outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all"
                  />
                </div>
              ))}

              {/* Inativos colapsados */}
              {servidoresInativos.length > 0 && (
                <details className="group">
                  <summary className="flex items-center gap-2 px-4 py-2.5 text-xs text-zinc-400 cursor-pointer hover:bg-zinc-50 select-none list-none">
                    <span className="group-open:rotate-90 transition-transform">▶</span>
                    {servidoresInativos.length} servidor{servidoresInativos.length !== 1 ? "es" : ""} inativo{servidoresInativos.length !== 1 ? "s" : ""}
                  </summary>
                  {servidoresInativos.map((s, i) => (
                    <div
                      key={s.id_servidor}
                      className={`flex items-center gap-3 px-4 py-2.5 bg-zinc-50/50 ${
                        i < servidoresInativos.length - 1 ? "border-b border-zinc-100" : ""
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-400 truncate">
                          {s.codigo_publico}
                        </p>
                        <p className="text-xs text-zinc-300">{s.nome_interno}</p>
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={creditosMap[s.id_servidor] ?? "0"}
                        onChange={(e) => setCredito(s.id_servidor, e.target.value)}
                        className="w-20 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-center outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all bg-white"
                      />
                    </div>
                  ))}
                </details>
              )}
            </div>
          </div>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isPending}
            className="h-10 rounded-xl border border-zinc-300 px-5 text-sm font-medium hover:bg-zinc-50 transition-all disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isPending || !contrato.trim()}
            className="h-10 rounded-xl bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isPending ? "Salvando..." : isEdit ? "Salvar alterações" : "Criar pacote"}
          </button>
        </div>
      </div>
    </div>
  );
}