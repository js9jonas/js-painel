// src/components/clientes/NovoClienteModal.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { criarClienteComAssinatura } from "@/app/actions/novoCliente";
import type { PlanoRow } from "@/lib/planos";
import type { PacoteRow } from "@/lib/pacotes";

type Props = {
  planos: PlanoRow[];
  pacotes: PacoteRow[];
  onClose: () => void;
};

const STATUS_OPTIONS = ["ativo", "inativo", "cancelado", "suspenso", "pendente"];
type Step = "cliente" | "assinatura";

export default function NovoClienteModal({ planos, pacotes, onClose }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("cliente");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [nome, setNome]             = useState("");
  const [observacao, setObservacao] = useState("");
  const [telefone, setTelefone]     = useState("");
  const [nomeContato, setNomeContato] = useState("");

  const [criarAssinatura, setCriarAssinatura] = useState(true);
  const [idPacote, setIdPacote]               = useState("");
  const [idPlano, setIdPlano]                 = useState("");
  const [vencContrato, setVencContrato]       = useState("");
  const [vencContas, setVencContas]           = useState("");
  const [status, setStatus]                   = useState("ativo");
  const [identificacao, setIdentificacao]     = useState("");
  const [obsAssinatura, setObsAssinatura]     = useState("");

  function handleSave() {
    if (!nome.trim()) { setError("Nome é obrigatório"); return; }
    setError(null);

    startTransition(async () => {
      try {
        const id = await criarClienteComAssinatura({
          nome,
          observacao:            observacao || null,
          telefone:              telefone || null,
          nome_contato:          nomeContato || null,
          criarAssinatura,
          id_pacote:             idPacote || null,
          id_plano:              idPlano  || null,
          venc_contrato:         vencContrato || null,
          venc_contas:           vencContas   || null,
          status,
          identificacao:         identificacao || null,
          observacao_assinatura: obsAssinatura || null,
        });
        router.push(`/clientes/${id}`);
        onClose();
      } catch (err: any) {
        if (err.code === "23505") {
          setError("Já existe um cliente com este nome.");
        } else {
          setError(err.message ?? "Erro ao salvar. Tente novamente.");
        }
      }
    });
  }

  const inputClass  = "w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all";
  const selectClass = "w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all bg-white";
  const labelClass  = "block text-xs font-semibold text-zinc-700 mb-1.5";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh]">

        <div className="px-6 pt-6 pb-4 border-b border-zinc-100">
          <h2 className="text-lg font-bold text-zinc-900">Novo Cliente</h2>
          <div className="flex items-center gap-2 mt-3">
            <button type="button" onClick={() => setStep("cliente")}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${step === "cliente" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}>
              <span className="w-4 h-4 rounded-full border-2 flex items-center justify-center text-[10px] border-current font-bold">1</span>
              Cliente
            </button>
            <div className="h-px flex-1 bg-zinc-200" />
            <button type="button" onClick={() => { if (nome.trim()) setStep("assinatura"); }} disabled={!nome.trim()}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${step === "assinatura" ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed"}`}>
              <span className="w-4 h-4 rounded-full border-2 flex items-center justify-center text-[10px] border-current font-bold">2</span>
              Assinatura
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {step === "cliente" && (
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Nome *</label>
                <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputClass} placeholder="Nome completo do cliente" autoFocus />
              </div>
              <div>
                <label className={labelClass}>Observação</label>
                <textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={3}
                  className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all resize-none"
                  placeholder="Observações sobre o cliente..." />
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
                <p className="text-xs font-semibold text-zinc-600 uppercase tracking-wide">📱 Contato (opcional)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Telefone</label>
                    <input value={telefone} onChange={(e) => setTelefone(e.target.value)} className={inputClass} placeholder="Ex: 51999998888" />
                  </div>
                  <div>
                    <label className={labelClass}>Nome do contato</label>
                    <input value={nomeContato} onChange={(e) => setNomeContato(e.target.value)} className={inputClass} placeholder="Opcional" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === "assinatura" && (
            <div className="space-y-4">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <div onClick={() => setCriarAssinatura(!criarAssinatura)}
                  className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${criarAssinatura ? "bg-zinc-900" : "bg-zinc-300"}`}>
                  <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${criarAssinatura ? "translate-x-4" : "translate-x-0"}`} />
                </div>
                <span className="text-sm font-medium text-zinc-700">Criar assinatura agora</span>
              </label>

              {criarAssinatura && (
                <div className="space-y-4">
                  <div>
                    <label className={labelClass}>Status</label>
                    <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectClass}>
                      {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Pacote</label>
                    <select value={idPacote} onChange={(e) => setIdPacote(e.target.value)} className={selectClass}>
                      <option value="">— Nenhum —</option>
                      {pacotes.map((p) => (
                        <option key={p.id_pacote} value={p.id_pacote}>
                          {p.contrato ?? `Pacote #${p.id_pacote}`}{p.telas ? ` (${p.telas} tela${p.telas !== 1 ? "s" : ""})` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Plano</label>
                    <select value={idPlano} onChange={(e) => setIdPlano(e.target.value)} className={selectClass}>
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
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelClass}>Venc. Contrato</label>
                      <input type="date" value={vencContrato} onChange={(e) => setVencContrato(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Venc. Contas</label>
                      <input type="date" value={vencContas} onChange={(e) => setVencContas(e.target.value)} className={inputClass} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>Identificação <span className="ml-1 text-zinc-400 font-normal">(localização / referência)</span></label>
                    <input value={identificacao} onChange={(e) => setIdentificacao(e.target.value)} className={inputClass} placeholder="Ex: Sala 3, Apto 201..." />
                  </div>
                  <div>
                    <label className={labelClass}>Observação da assinatura</label>
                    <textarea value={obsAssinatura} onChange={(e) => setObsAssinatura(e.target.value)} rows={2}
                      className="w-full rounded-xl border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all resize-none"
                      placeholder="Observações sobre esta assinatura..." />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {error && <p className="mx-6 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

        <div className="px-6 py-4 border-t border-zinc-100 flex items-center justify-between gap-3">
          <div>
            {step === "assinatura" && (
              <button type="button" onClick={() => setStep("cliente")}
                className="h-10 rounded-xl border border-zinc-300 px-4 text-sm font-medium hover:bg-zinc-50 transition-all">
                ← Voltar
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={isPending}
              className="h-10 rounded-xl border border-zinc-300 px-5 text-sm font-medium hover:bg-zinc-50 transition-all disabled:opacity-50">
              Cancelar
            </button>
            {step === "cliente" ? (
              <button type="button" onClick={() => { if (!nome.trim()) { setError("Nome é obrigatório"); return; } setError(null); setStep("assinatura"); }}
                className="h-10 rounded-xl bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 transition-all">
                Próximo →
              </button>
            ) : (
              <button type="button" onClick={handleSave} disabled={isPending}
                className="h-10 rounded-xl bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                {isPending ? "Salvando..." : "✓ Criar cliente"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}