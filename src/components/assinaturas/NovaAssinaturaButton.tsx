"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inserirAssinatura } from "@/app/actions/inserirAssinatura";
import type { PlanoRow } from "@/lib/planos";
import type { PacoteRow } from "@/lib/pacotes";

type Props = {
  idCliente: string;
  planos: PlanoRow[];
  pacotes: PacoteRow[];
};

// ✅ STATUS_OPTIONS alinhado ao modelo de negócio
const STATUS_OPTIONS = ["ativo", "atrasado", "vencido", "inativo", "pendente", "cancelado"];

export default function NovaAssinaturaButton({ idCliente, planos, pacotes }: Props) {
  const [open, setOpen]              = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError]            = useState<string | null>(null);
  const router = useRouter();

  const [idPacote, setIdPacote]           = useState("");
  const [idPlano, setIdPlano]             = useState("");

  const pacoteSelecionado = pacotes.find(p => p.id_pacote === idPacote);
  const planosFiltrados = planos.filter(p =>
    p.meses === 1 &&
    (pacoteSelecionado ? p.telas === pacoteSelecionado.telas : true)
  );

  function handlePacoteChange(novoId: string) {
    setIdPacote(novoId);
    setIdPlano("");
  }
  const [vencContrato, setVencContrato]   = useState("");
  const [vencContas, setVencContas]       = useState("");
  const [status, setStatus]               = useState("ativo");
  const [identificacao, setIdentificacao] = useState("");
  const [observacao, setObservacao]       = useState("");

  function handleClose() {
    setOpen(false); setError(null);
    setIdPacote(""); setIdPlano(""); setVencContrato(""); setVencContas("");
    setStatus("ativo"); setIdentificacao(""); setObservacao("");
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        await inserirAssinatura(idCliente, {
          id_pacote:     idPacote     || null,
          id_plano:      idPlano      || null,
          venc_contrato: vencContrato || null,
          venc_contas:   vencContas   || null,
          status,
          identificacao: identificacao || null,
          observacao:    observacao    || null,
        });
        router.refresh();
        handleClose();
      } catch (err: any) {
        setError(err.message ?? "Erro ao salvar.");
      }
    });
  }

  const inputClass  = "w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 transition-all";
  const selectClass = "w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 transition-all bg-white";
  const labelClass  = "block text-xs font-semibold text-zinc-700 mb-1.5";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-9 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-all shadow-sm"
      >
        + Assinatura
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={handleClose} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh] overflow-x-hidden">

            <div className="px-4 pt-5 pb-4 border-b border-zinc-100 sm:px-6 sm:pt-6">
              <h2 className="text-lg font-bold text-zinc-900">Nova Assinatura</h2>
              <p className="text-sm text-zinc-500 mt-0.5">Cliente ID {idCliente}</p>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 sm:px-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Status</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}>
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Venc. Contrato</label>
                  <input type="date" value={vencContrato} onChange={(e) => setVencContrato(e.target.value)} className={inputClass} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Pacote</label>
                  <select value={idPacote} onChange={(e) => handlePacoteChange(e.target.value)} className={selectClass}>
                    <option value="">— Nenhum —</option>
                    {pacotes.map((p) => (
                      <option key={p.id_pacote} value={p.id_pacote}>
                        {p.contrato ?? `Pacote #${p.id_pacote}`}
                        {p.telas ? ` (${p.telas} tela${p.telas !== 1 ? "s" : ""})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Venc. Contas</label>
                  <input type="date" value={vencContas} onChange={(e) => setVencContas(e.target.value)} className={inputClass} />
                </div>
              </div>

              <div>
                <label className={labelClass}>
                  Plano
                  {pacoteSelecionado && (
                    <span className="ml-1 text-zinc-400 font-normal">
                      ({pacoteSelecionado.telas} tela{pacoteSelecionado.telas !== 1 ? "s" : ""}, mensal)
                    </span>
                  )}
                </label>
                <select value={idPlano} onChange={(e) => setIdPlano(e.target.value)} className={selectClass}>
                  <option value="">— Nenhum —</option>
                  {planosFiltrados.map((p) => (
                    <option key={p.id_plano} value={p.id_plano}>
                      {p.tipo ?? `Plano #${p.id_plano}`}
                      {p.valor ? ` — R$ ${parseFloat(p.valor).toFixed(2).replace(".", ",")}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>Identificação <span className="ml-1 text-zinc-400 font-normal">(localização / referência)</span></label>
                <input value={identificacao} onChange={(e) => setIdentificacao(e.target.value)} className={inputClass} placeholder="Ex: Sala 3, Apto 201..." />
              </div>

              <div>
                <label className={labelClass}>Observação</label>
                <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2}
                  className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 transition-all resize-none"
                  placeholder="Observações sobre esta assinatura..." />
              </div>
            </div>

            {error && <p className="mx-4 sm:mx-6 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

            <div className="px-4 py-4 border-t border-zinc-100 flex flex-wrap justify-end gap-3 sm:px-6">
              <button onClick={handleClose} disabled={isPending}
                className="h-10 rounded-xl border border-zinc-300 px-5 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={handleSave} disabled={isPending}
                className="h-10 rounded-xl bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
                {isPending ? "Salvando..." : "✓ Criar assinatura"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}