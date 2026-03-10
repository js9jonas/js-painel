"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertaAppRow } from "@/lib/alertas";
import { renovarValidadeApp } from "@/app/actions/renovarValidadeApp";
import { renovarAplicativo } from "@/app/actions/renovarAplicativo";

type Filtro = "todos" | "com_contrato" | "sem_assinatura";

type ModalData = {
  id_app_registro: string;
  id_cliente: string;
  nome: string;
  nome_app: string;
};

function diasRestantes(data: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const venc = new Date(data + "T00:00:00");
  return Math.round((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

function badgeDias(dias: number) {
  if (dias < 0) return "bg-red-100 text-red-700";
  if (dias === 0) return "bg-orange-100 text-orange-700";
  if (dias <= 2) return "bg-yellow-100 text-yellow-700";
  return "bg-blue-50 text-blue-700";
}

function labelDias(dias: number) {
  if (dias < 0) return `${Math.abs(dias)}d atrás`;
  if (dias === 0) return "Hoje";
  if (dias === 1) return "Amanhã";
  return `Em ${dias}d`;
}

export default function AlertasAppsClient({
  apps,
  recolhivel,
}: {
  apps: AlertaAppRow[];
  recolhivel?: boolean;
}) {
  const [aberto, setAberto] = useState(true);
  const [filtro, setFiltro] = useState<Filtro>("com_contrato");
  const [modal, setModal] = useState<ModalData | null>(null);
  const [modo, setModo] = useState<"pagamento" | "somente">("pagamento");
  const [forma, setForma] = useState("Pix");
  const [valor, setValor] = useState("20");
  const [isPending, startTransition] = useTransition();

  const ontem = new Date();
  ontem.setDate(ontem.getDate() - 1);
  ontem.setHours(0, 0, 0, 0);

  const filtrados = apps.filter((r) => {
    if (filtro === "com_contrato") {
      if (!r.venc_contrato_cliente) return false;
      return new Date(r.venc_contrato_cliente + "T00:00:00") > ontem;
    }
    if (filtro === "sem_assinatura") return !r.venc_contrato_cliente;
    return true;
  });

  function abrirModal(r: AlertaAppRow) {
    setModal({
      id_app_registro: r.id_app_registro,
      id_cliente: r.id_cliente,
      nome: r.nome,
      nome_app: r.nome_app,
    });
    setModo("pagamento");
    setForma("PIX");
    setValor("20");
  }

  function fecharModal() {
    if (isPending) return;
    setModal(null);
  }

  function handleConfirmar() {
    if (!modal) return;
    startTransition(async () => {
      if (modo === "somente") {
        await renovarValidadeApp(modal.id_app_registro);
      } else {
        await renovarAplicativo({
          id_app_registro: Number(modal.id_app_registro),
          id_cliente: Number(modal.id_cliente),
          renovarValidade: true,
          valor: parseFloat(valor) || 0,
          forma,
          detalhes: "",
        });
      }
      setModal(null);
    });
  }

  const btBase = "h-7 px-3 rounded-lg text-xs font-medium transition-colors border";
  const btAtivo = "bg-blue-600 text-white border-blue-600";
  const btInativo = "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400";

  return (
    <>
      <div className="rounded-2xl border bg-white overflow-hidden shadow-sm">
        {/* Header */}
        <div className="px-5 py-4 border-b bg-blue-50 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-blue-900">📱 Aplicativos expirando</p>
            <p className="text-xs text-blue-700 mt-0.5">Validade ≤ 7 dias • Status ativa</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold text-blue-900">{filtrados.length}</span>
            {recolhivel && (
              <button
                onClick={() => setAberto((v) => !v)}
                className="text-blue-400 hover:text-blue-600 transition"
                title={aberto ? "Recolher" : "Expandir"}
              >
                <svg
                  className={`w-4 h-4 transition-transform duration-200 ${aberto ? "rotate-0" : "-rotate-90"}`}
                  fill="none" viewBox="0 0 16 16"
                >
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {aberto && (
          <>
            {/* Filtros */}
            <div className="px-5 py-3 border-b bg-zinc-50 flex items-center gap-2">
              <span className="text-xs text-zinc-500 mr-1">Filtrar:</span>
              {(
                [
                  { key: "todos", label: "Todos" },
                  { key: "com_contrato", label: "Venc. contrato > ontem" },
                  { key: "sem_assinatura", label: "Sem assinatura" },
                ] as { key: Filtro; label: string }[]
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFiltro(key)}
                  className={`${btBase} ${filtro === key ? btAtivo : btInativo}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Tabela */}
            {filtrados.length === 0 ? (
              <div className="px-5 py-10 text-center text-zinc-400 text-sm">
                Nenhum aplicativo encontrado para este filtro ✅
              </div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 border-b">
                    <tr>
                      {["Cliente", "Pacote", "App", "MAC / Obs.", "Venc. Contrato", "Prazo", ""].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 uppercase">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {filtrados.map((r) => {
                      const dias = diasRestantes(r.validade);
                      return (
                        <tr key={r.id_app_registro} className="hover:bg-zinc-50/50">
                          <td className="px-4 py-3">
                            <Link
                              href={`/clientes/${r.id_cliente}`}
                              className="font-medium text-zinc-900 hover:underline hover:text-zinc-600"
                            >
                              {r.nome}
                            </Link>
                            <div className="text-xs text-zinc-400">ID {r.id_cliente}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-zinc-700">
                              {r.pacote_contrato ?? <span className="text-zinc-400 italic">—</span>}
                            </span>
                            <div className="text-xs text-zinc-400">
                              {r.total_apps} app{r.total_apps !== 1 ? "s" : ""}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-zinc-700">{r.nome_app}</td>
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs text-zinc-500">{r.mac ?? "—"}</span>
                            {r.observacao && (
                              <div className="text-xs text-zinc-400 mt-0.5 max-w-[180px] truncate" title={r.observacao}>
                                {r.observacao}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-zinc-600">
                            {r.venc_contrato_cliente
                              ? r.venc_contrato_cliente.split("T")[0].split("-").reverse().join("/")
                              : <span className="text-zinc-400 italic">Sem assinatura</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${badgeDias(dias)}`}>
                              {labelDias(dias)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => abrirModal(r)}
                              className="h-7 rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-700 transition-colors"
                            >
                              +1 ano
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-6 space-y-5">
            <div>
              <p className="text-base font-semibold text-zinc-900">Renovar aplicativo</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {modal.nome} — {modal.nome_app}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setModo("pagamento")}
                className={`rounded-xl border py-3 text-xs font-medium transition-colors ${modo === "pagamento"
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 text-zinc-600 hover:border-zinc-400"}`}
              >
                💳 Com pagamento
              </button>
              <button
                onClick={() => setModo("somente")}
                className={`rounded-xl border py-3 text-xs font-medium transition-colors ${modo === "somente"
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-200 text-zinc-600 hover:border-zinc-400"}`}
              >
                🔄 Só renovar
              </button>
            </div>
            {modo === "pagamento" && (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Forma de pagamento</label>
                  <select
                    value={forma}
                    onChange={(e) => setForma(e.target.value)}
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-300"
                  >
                    <option>PIX</option>
                    <option>Dinheiro</option>
                    <option>Cartão</option>
                    <option>Transferência</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1 block">Valor (R$)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    placeholder="0,00"
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-300"
                  />
                </div>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={fecharModal}
                disabled={isPending}
                className="flex-1 rounded-xl border border-zinc-200 py-2 text-sm text-zinc-600 hover:border-zinc-400 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmar}
                disabled={isPending || (modo === "pagamento" && !valor)}
                className="flex-1 rounded-xl bg-zinc-900 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors disabled:opacity-50"
              >
                {isPending ? "Salvando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}