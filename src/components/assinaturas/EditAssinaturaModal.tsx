// src/components/assinaturas/EditAssinaturaModal.tsx
"use client";

import { useState, useTransition } from "react";
import { updateAssinatura } from "@/app/actions/assinaturas";
import type { PlanoRow } from "@/lib/planos";
import type { PacoteRow } from "@/lib/pacotes";

type AssinaturaData = {
  id_assinatura: string;
  id_plano: string | null;
  id_pacote: string | null;
  venc_contrato: string | null;
  venc_contas: string | null;
  status: string | null;
  identificacao: string | null;
  observacao: string | null;
};

type Props = {
  idCliente: string;
  assinatura: AssinaturaData;
  planos: PlanoRow[];
  pacotes: PacoteRow[];
  onClose: () => void;
  onSaved: () => void;
};

const STATUS_OPTIONS = ["ativo", "inativo", "cancelado", "suspenso", "pendente"];

function toDateInput(v: string | null): string {
  if (!v) return "";
  return v.split("T")[0];
}

export default function EditAssinaturaModal({
  idCliente,
  assinatura,
  planos,
  pacotes,
  onClose,
  onSaved,
}: Props) {
  const [idPlano, setIdPlano]               = useState(assinatura.id_plano ?? "");
  const [idPacote, setIdPacote]             = useState(assinatura.id_pacote ?? "");
  const [vencContrato, setVencContrato]     = useState(toDateInput(assinatura.venc_contrato));
  const [vencContas, setVencContas]         = useState(toDateInput(assinatura.venc_contas));
  const [status, setStatus]                 = useState(assinatura.status ?? "ativo");
  const [identificacao, setIdentificacao]   = useState(assinatura.identificacao ?? "");
  const [observacao, setObservacao]         = useState(assinatura.observacao ?? "");
  const [isPending, startTransition]        = useTransition();
  const [error, setError]                   = useState<string | null>(null);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await updateAssinatura(assinatura.id_assinatura, idCliente, {
          id_pacote:     idPacote || null,
          id_plano:      idPlano  || null,
          venc_contrato: vencContrato || null,
          venc_contas:   vencContas   || null,
          status,
          identificacao: identificacao || null,
          observacao:    observacao    || null,
        });
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

  const textareaClass =
    "w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all resize-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-zinc-900">Editar Assinatura</h2>
          <p className="text-sm text-zinc-500 mt-0.5">ID: {assinatura.id_assinatura}</p>
        </div>

        <div className="space-y-4">

          {/* Status */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={selectClass}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Pacote */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
              Pacote
            </label>
            <select
              value={idPacote}
              onChange={(e) => setIdPacote(e.target.value)}
              className={selectClass}
            >
              <option value="">— Nenhum —</option>
              {pacotes.map((p) => (
                <option key={p.id_pacote} value={p.id_pacote}>
                  {p.contrato ?? `Pacote #${p.id_pacote}`}
                  {p.telas ? ` (${p.telas} tela${p.telas !== 1 ? "s" : ""})` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Plano */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
              Plano
            </label>
            <select
              value={idPlano}
              onChange={(e) => setIdPlano(e.target.value)}
              className={selectClass}
            >
              <option value="">— Nenhum —</option>
              {planos.map((p) => (
                <option key={p.id_plano} value={p.id_plano}>
                  {p.tipo ?? `Plano #${p.id_plano}`}
                  {p.meses ? ` — ${p.meses} ${p.meses === 1 ? "mês" : "meses"}` : ""}
                  {p.valor ? ` — R$ ${parseFloat(p.valor).toFixed(2).replace(".", ",")}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Vencimentos */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Venc. Contrato
              </label>
              <input
                type="date"
                value={vencContrato}
                onChange={(e) => setVencContrato(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                Venc. Contas
              </label>
              <input
                type="date"
                value={vencContas}
                onChange={(e) => setVencContas(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {/* Identificação */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
              Identificação
              <span className="ml-1 text-zinc-400 font-normal">(localização / referência)</span>
            </label>
            <input
              value={identificacao}
              onChange={(e) => setIdentificacao(e.target.value)}
              className={inputClass}
              placeholder="Ex: Sala 3, Apto 201, Referência X..."
            />
          </div>

          {/* Observação */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
              Observação
            </label>
            <textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={3}
              className={textareaClass}
              placeholder="Observações sobre esta assinatura..."
            />
          </div>

        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
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
            {isPending ? "Salvando..." : "Salvar alterações"}
          </button>
        </div>
      </div>
    </div>
  );
}
