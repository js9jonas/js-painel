// src/components/aplicativos/ModalRenovarAplicativo.tsx
"use client";

import { useState } from "react";

interface Props {
  id_app_registro: number;
  id_cliente: number;
  nome_app: string;
  onClose: () => void;
}

const FORMAS = ["PIX", "Dinheiro", "Cartão", "Transferência"];
const VALOR_FIXO = 20;

export default function ModalRenovarAplicativo({
  id_app_registro,
  id_cliente,
  nome_app,
  onClose,
}: Props) {
  const [renovarValidade, setRenovarValidade] = useState(true);
  const [forma, setForma] = useState("PIX");
  const [detalhes, setDetalhes] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErro("");

    try {
      const { renovarAplicativo } = await import("@/app/actions/renovarAplicativo");
      const res = await renovarAplicativo({
        id_app_registro,
        id_cliente,
        renovarValidade,
        valor: VALOR_FIXO,
        forma,
        detalhes,
      });

      if (res.success) {
        onClose();
      } else {
        setErro(res.error ?? "Erro ao registrar pagamento.");
      }
    } catch (err) {
      setErro("Erro inesperado. Tente novamente.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
        <h2 className="text-base font-semibold text-zinc-900 mb-1">
          Lançar pagamento
        </h2>
        <p className="text-sm text-zinc-500 mb-5">{nome_app}</p>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Valor fixo informativo */}
          <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-zinc-600">Valor</span>
            <span className="text-sm font-semibold text-zinc-900">R$ 20,00</span>
          </div>

          {/* Renovar validade */}
          <div>
            <p className="text-sm font-medium text-zinc-700 mb-2">Validade</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRenovarValidade(true)}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition
                  ${renovarValidade
                    ? "bg-zinc-900 text-white border-zinc-900"
                    : "border-zinc-300 text-zinc-600 hover:bg-zinc-50"
                  }`}
              >
                + 1 ano
              </button>
              <button
                type="button"
                onClick={() => setRenovarValidade(false)}
                className={`flex-1 py-2 rounded-lg border text-sm font-medium transition
                  ${!renovarValidade
                    ? "bg-zinc-900 text-white border-zinc-900"
                    : "border-zinc-300 text-zinc-600 hover:bg-zinc-50"
                  }`}
              >
                Não alterar
              </button>
            </div>
          </div>

          {/* Forma de pagamento */}
          <div>
            <label className="text-sm font-medium text-zinc-700">Forma de pagamento</label>
            <select
              value={forma}
              onChange={(e) => setForma(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
            >
              {FORMAS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>

          {/* Detalhes */}
          <div>
            <label className="text-sm font-medium text-zinc-700">Detalhes (opcional)</label>
            <input
              type="text"
              value={detalhes}
              onChange={(e) => setDetalhes(e.target.value)}
              placeholder="Observações..."
              className="mt-1.5 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900"
            />
          </div>

          {erro && <p className="text-sm text-red-500">{erro}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-zinc-300 text-sm hover:bg-zinc-50 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 disabled:opacity-50 transition"
            >
              {loading ? "Salvando..." : "Confirmar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}