"use client";

import { useState } from "react";
import { renovarAplicativo } from "@/app/actions/renovarAplicativo";

interface Props {
  id_app_registro: number;
  id_cliente: number;
  nome_app: string;
  validadeAtual: string | null; // ISO date string
  onClose: () => void;
}

const FORMAS = ["PIX", "Nubank", "Nu PJ", "Lotérica", "Dinheiro", "Sicredi", "Caixa", "Banrisul", "Outro"];

function calcNovaValidade(validadeAtual: string | null): string {
  const base = validadeAtual
    ? new Date(validadeAtual + "T00:00:00")
    : new Date();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const ref = base < hoje ? hoje : base;
  ref.setFullYear(ref.getFullYear() + 1);
  return ref.toISOString().split("T")[0];
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return d.split("T")[0].split("-").reverse().join("/");
}

type Modo = "cortesia" | "pagamento" | "pendente";

export default function ModalRenovarAplicativo({
  id_app_registro,
  id_cliente,
  nome_app,
  validadeAtual,
  onClose,
}: Props) {
  const [modo, setModo] = useState<Modo>("pagamento");
  const [novaValidade, setNovaValidade] = useState(() => calcNovaValidade(validadeAtual));
  const [forma, setForma] = useState("PIX");
  const [valor, setValor] = useState("20");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  const inputClass =
    "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all";

  async function handleConfirmar() {
    if (modo === "pagamento" && !valor.trim()) {
      setErro("Informe o valor do pagamento.");
      return;
    }
    setLoading(true);
    setErro("");

    const res = await renovarAplicativo({
      id_app_registro,
      id_cliente,
      novaValidade,
      modo,
      valor: modo === "pagamento" ? parseFloat(valor) || 0 : 0,
      forma,
    });

    setLoading(false);

    if (res.success) {
      onClose();
    } else {
      setErro(res.error ?? "Erro ao salvar.");
    }
  }

  const modoConfig: Record<Modo, { label: string; cor: string; corAtivo: string }> = {
    cortesia:  { label: "🎁 Cortesia",  cor: "border-zinc-200 text-zinc-600 hover:border-zinc-400",            corAtivo: "bg-zinc-900 border-zinc-900 text-white" },
    pagamento: { label: "💳 Pagamento", cor: "border-zinc-200 text-zinc-600 hover:border-zinc-400",            corAtivo: "bg-emerald-600 border-emerald-600 text-white" },
    pendente:  { label: "⏳ Pendente",  cor: "border-zinc-200 text-zinc-600 hover:border-zinc-400",            corAtivo: "bg-amber-500 border-amber-500 text-white" },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">

        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b">
          <h2 className="text-base font-semibold text-zinc-900">Gerenciar aplicativo</h2>
          <p className="text-sm text-zinc-500 mt-0.5">{nome_app}</p>
          {validadeAtual && (
            <p className="text-xs text-zinc-400 mt-1">
              Validade atual: <span className="font-medium text-zinc-600">{formatDate(validadeAtual)}</span>
            </p>
          )}
        </div>

        <div className="px-6 py-4 space-y-4">

          {/* Nova validade */}
          <div>
            <label className="text-xs font-semibold text-zinc-700 mb-1.5 block">Nova validade</label>
            <input
              type="date"
              value={novaValidade}
              onChange={(e) => setNovaValidade(e.target.value)}
              className={inputClass}
            />
          </div>

          {/* Seleção de modo */}
          <div>
            <label className="text-xs font-semibold text-zinc-700 mb-1.5 block">Tipo de renovação</label>
            <div className="grid grid-cols-3 gap-2">
              {(["cortesia", "pagamento", "pendente"] as Modo[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModo(m)}
                  className={`py-2 rounded-xl border text-xs font-medium transition-colors ${
                    modo === m ? modoConfig[m].corAtivo : modoConfig[m].cor
                  }`}
                >
                  {modoConfig[m].label}
                </button>
              ))}
            </div>
          </div>

          {/* Campos de pagamento */}
          {modo === "pagamento" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-zinc-700 mb-1.5 block">Forma</label>
                <select value={forma} onChange={(e) => setForma(e.target.value)} className={inputClass}>
                  {FORMAS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-700 mb-1.5 block">Valor (R$)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  className={inputClass}
                  placeholder="0,00"
                />
              </div>
            </div>
          )}

          {/* Aviso pendente */}
          {modo === "pendente" && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              A validade será atualizada mas nenhum pagamento será registrado. O app ficará como <b>pendente</b> e aparecerá na lista de pendentes.
            </div>
          )}

          {/* Aviso cortesia */}
          {modo === "cortesia" && (
            <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-2 text-xs text-zinc-600">
              Somente a validade será atualizada. Nenhum pagamento registrado.
            </div>
          )}

          {erro && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{erro}</p>
          )}
        </div>

        {/* Ações */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-2 rounded-xl border border-zinc-300 text-sm hover:bg-zinc-50 disabled:opacity-50 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmar}
            disabled={loading}
            className={`flex-1 py-2 rounded-xl text-sm font-medium text-white disabled:opacity-50 transition ${
              modo === "pendente"
                ? "bg-amber-500 hover:bg-amber-600"
                : modo === "cortesia"
                ? "bg-zinc-900 hover:bg-zinc-800"
                : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {loading ? "Salvando..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}