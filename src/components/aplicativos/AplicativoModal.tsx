// src/components/aplicativos/AplicativoModal.tsx
"use client";

import { useState, useTransition } from "react";
import { createAplicativo, updateAplicativo, type AplicativoData } from "@/app/actions/aplicativos";
import type { AplicativoRow, AppRow } from "@/lib/aplicativos";

type Props = {
  idCliente: string;
  aplicativo?: AplicativoRow | null;
  apps: AppRow[];
  onClose: () => void;
  onSaved: () => void;
};

const STATUS_OPTIONS = ["ativa", "inativa", "neutra"];

function toDateInput(v: string | null): string {
  if (!v) return "";
  return v.split("T")[0];
}

export default function AplicativoModal({ idCliente, aplicativo, apps, onClose, onSaved }: Props) {
  const isEdit = !!aplicativo;

  const [idApp, setIdApp]               = useState(String(aplicativo?.id_app ?? ""));
  const [mac, setMac]                   = useState(aplicativo?.mac ?? "");
  const [chave, setChave]               = useState(aplicativo?.chave ?? "");
  const [validade, setValidade]         = useState(toDateInput(aplicativo?.validade ?? null));
  const [status, setStatus]             = useState(aplicativo?.status ?? "ativa");
  const [observacao, setObservacao]     = useState(aplicativo?.observacao ?? "");
  const [idAssinatura, setIdAssinatura] = useState(String(aplicativo?.id_assinatura ?? ""));
  const [idConta, setIdConta]           = useState(String(aplicativo?.id_conta ?? ""));
  const [idDispositivo, setIdDispositivo] = useState(String(aplicativo?.id_dispositivo ?? ""));

  const [isPending, startTransition] = useTransition();
  const [error, setError]            = useState<string | null>(null);

  // App selecionado para mostrar info
  const appSelecionado = apps.find((a) => a.id_app === idApp) ?? null;

  function handleSave() {
    setError(null);
    const data: AplicativoData = {
      id_cliente:     null,       // ← ADICIONAR esta linha
      id_app:         idApp        || null,
      mac:            mac          || null,
      chave:          chave        || null,
      validade:       validade     || null,
      status,
      observacao:     observacao   || null,
      id_assinatura:  idAssinatura || null,
      id_conta:       idConta      || null,
      id_dispositivo: idDispositivo || null,
    };

    startTransition(async () => {
      try {
        if (isEdit && aplicativo) {
          await updateAplicativo(aplicativo.id_app_registro, idCliente, {
  ...data,
  id_cliente: idCliente,
});
        } else {
          await createAplicativo(idCliente, data);
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
  const selectClass =
    "w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all bg-white";
  const labelClass = "block text-xs font-semibold text-zinc-700 mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-zinc-100">
          <h2 className="text-lg font-bold text-zinc-900">
            {isEdit ? "Editar Aplicativo" : "Novo Aplicativo"}
          </h2>
          {isEdit && (
            <p className="text-sm text-zinc-500 mt-0.5">
              Registro #{aplicativo!.id_app_registro}
            </p>
          )}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* App */}
          <div>
            <label className={labelClass}>Aplicativo</label>
            <select
              value={idApp}
              onChange={(e) => setIdApp(e.target.value)}
              className={selectClass}
            >
              <option value="">— Selecione —</option>
              {apps.map((a) => (
                <option key={a.id_app} value={a.id_app}>
                  {a.nome_app}
                  {a.exige_licenca ? " 🔑" : ""}
                </option>
              ))}
            </select>
            {appSelecionado?.url_referencia && (
              <a
                href={appSelecionado.url_referencia}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 text-xs text-blue-600 hover:underline inline-block"
              >
                🔗 {appSelecionado.url_referencia}
              </a>
            )}
            {appSelecionado?.observacao && (
              <p className="mt-1 text-xs text-zinc-500">{appSelecionado.observacao}</p>
            )}
          </div>

          {/* Status e Validade */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Validade</label>
              <input
                type="date"
                value={validade}
                onChange={(e) => setValidade(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* MAC e Chave */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>MAC Address</label>
              <input
                value={mac}
                onChange={(e) => setMac(e.target.value)}
                className={inputClass}
                placeholder="Ex: 00:1A:2B:3C:4D:5E"
              />
            </div>
            <div>
              <label className={labelClass}>
                Chave / Licença
                {appSelecionado?.exige_licenca && (
                  <span className="ml-1 text-amber-600 font-normal">🔑 obrigatória</span>
                )}
              </label>
              <input
                value={chave}
                onChange={(e) => setChave(e.target.value)}
                className={inputClass}
                placeholder="Chave de ativação..."
              />
            </div>
          </div>

          {/* IDs de referência */}
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
              Vínculos (opcional)
            </p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelClass}>ID Assinatura</label>
                <input
                  type="number"
                  value={idAssinatura}
                  onChange={(e) => setIdAssinatura(e.target.value)}
                  className={inputClass}
                  placeholder="—"
                />
              </div>
              <div>
                <label className={labelClass}>ID Conta</label>
                <input
                  type="number"
                  value={idConta}
                  onChange={(e) => setIdConta(e.target.value)}
                  className={inputClass}
                  placeholder="—"
                />
              </div>
              <div>
                <label className={labelClass}>ID Dispositivo</label>
                <input
                  type="number"
                  value={idDispositivo}
                  onChange={(e) => setIdDispositivo(e.target.value)}
                  className={inputClass}
                  placeholder="—"
                />
              </div>
            </div>
          </div>

          {/* Observação */}
          <div>
            <label className={labelClass}>Observação</label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all resize-none"
              placeholder="Observações sobre este aplicativo..."
            />
          </div>

        </div>

        {error && (
          <p className="mx-6 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-100 flex justify-end gap-3">
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
            disabled={isPending}
            className="h-10 rounded-xl bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isPending ? "Salvando..." : isEdit ? "Salvar alterações" : "Adicionar"}
          </button>
        </div>
      </div>
    </div>
  );
}
