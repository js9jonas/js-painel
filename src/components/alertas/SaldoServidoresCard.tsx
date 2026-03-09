"use client";

// src/components/alertas/SaldoServidoresCard.tsx
import { useState } from "react";
import type { SaldoServidorRow, PrevisaoRow, ConsumoMensalRow } from "@/lib/saldoServidor";

type Props = {
  saldos: SaldoServidorRow[];
  previsoes: PrevisaoRow[];
  consumos: ConsumoMensalRow[];
};

function badgeSaldo(saldo: number) {
  if (saldo <= 0) return "bg-red-100 text-red-700";
  if (saldo <= 30) return "bg-orange-100 text-orange-700";
  if (saldo <= 80) return "bg-yellow-100 text-yellow-700";
  return "bg-emerald-100 text-emerald-700";
}

function badgePrevisao(dataStr: string | null): string {
  if (!dataStr) return "bg-emerald-100 text-emerald-700";
  const dias = Math.round(
    (new Date(dataStr).getTime() - new Date().setHours(0,0,0,0)) / (1000 * 60 * 60 * 24)
  );
  if (dias <= 0) return "bg-red-100 text-red-700";
  if (dias <= 7) return "bg-red-100 text-red-700";
  if (dias <= 15) return "bg-orange-100 text-orange-700";
  if (dias <= 30) return "bg-yellow-100 text-yellow-700";
  return "bg-blue-50 text-blue-700";
}

function formatPrevisao(dataStr: string | null): string {
  if (!dataStr) return "Além de 24 meses";
  const [y, m, d] = dataStr.split("-");
  const dias = Math.round(
    (new Date(dataStr).getTime() - new Date().setHours(0,0,0,0)) / (1000 * 60 * 60 * 24)
  );
  return `${d}/${m}/${y} (${dias}d)`;
}

type ModalState = {
  id_servidor: string;
  nome: string;
  saldo_atual: number;
} | null;

type HistoricoRow = {
  id_historico: string;
  tipo: string;
  quantidade: number;
  saldo_anterior: number;
  saldo_novo: number;
  observacao: string | null;
  id_assinatura: string | null;
  criado_em: string;
};

export default function SaldoServidoresCard({ saldos: initialSaldos, previsoes, consumos }: Props) {
  const [saldos, setSaldos] = useState(initialSaldos);
  const [filtro, setFiltro] = useState<"ativos" | "todos">("ativos");
  const [modal, setModal] = useState<ModalState>(null);
  const [historico, setHistorico] = useState<HistoricoRow[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [tipo, setTipo] = useState<"recarga" | "ajuste">("recarga");
  const [quantidade, setQuantidade] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  const previsaoMap = Object.fromEntries(
    previsoes.map((p) => [p.id_servidor, p.data_esgotamento])
  );

  const consumoMap = Object.fromEntries(
    consumos.map((c) => [c.id_servidor, c.creditos_mensal])
  );

  const saldosFiltrados = (filtro === "ativos"
    ? saldos.filter((s) => s.exibir_saldo)
    : saldos
  ).slice().sort((a, b) => {
    const pa = previsaoMap[a.id_servidor] ?? null;
    const pb = previsaoMap[b.id_servidor] ?? null;
    if (!pa && !pb) return 0;
    if (!pa) return 1;  // sem previsão (>24 meses) vai pro final
    if (!pb) return -1;
    return pa.localeCompare(pb);
  });

  async function toggleExibir(s: SaldoServidorRow) {
    setTogglingId(s.id_servidor);
    const novoValor = !s.exibir_saldo;
    const res = await fetch("/api/servidores/saldo", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id_servidor: s.id_servidor, exibir_saldo: novoValor }),
    });
    if (res.ok) {
      setSaldos((prev) =>
        prev.map((item) =>
          item.id_servidor === s.id_servidor ? { ...item, exibir_saldo: novoValor } : item
        )
      );
    }
    setTogglingId(null);
  }

  async function abrirModal(s: SaldoServidorRow) {
    setModal({ id_servidor: s.id_servidor, nome: s.codigo_publico, saldo_atual: s.saldo_atual });
    setTipo("recarga");
    setQuantidade("");
    setObservacao("");
    setErro("");
    setLoadingHistorico(true);
    const res = await fetch(`/api/servidores/saldo/historico?id_servidor=${s.id_servidor}&limite=15`);
    if (res.ok) {
      const data = await res.json();
      setHistorico(data.historico ?? []);
    }
    setLoadingHistorico(false);
  }

  async function salvar() {
    if (!modal) return;
    const qtd = Number(quantidade);
    if (!qtd || isNaN(qtd)) { setErro("Informe uma quantidade válida."); return; }
    setSalvando(true);
    setErro("");
    const res = await fetch("/api/servidores/saldo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id_servidor: modal.id_servidor,
        quantidade: tipo === "ajuste" ? qtd : Math.abs(qtd),
        tipo,
        observacao: observacao || null,
      }),
    });
    const data = await res.json();
    if (!data.ok) { setErro(data.error ?? "Erro ao salvar."); setSalvando(false); return; }
    setSaldos((prev) =>
      prev.map((s) =>
        s.id_servidor === modal.id_servidor ? { ...s, saldo_atual: data.saldo_novo } : s
      )
    );
    setModal(null);
    setSalvando(false);
  }

  function labelTipo(t: string) {
    if (t === "abatimento") return "↓ Abatimento";
    if (t === "recarga") return "↑ Recarga";
    return "⇄ Ajuste";
  }

  function corTipo(t: string) {
    if (t === "abatimento") return "text-red-600";
    if (t === "recarga") return "text-emerald-600";
    return "text-blue-600";
  }

  function formatData(iso: string) {
    const [datePart, timePart] = iso.split("T");
    if (!datePart) return "—";
    const [y, m, d] = datePart.split("-");
    const time = timePart ? timePart.substring(0, 5) : "";
    return `${d}/${m}/${y}${time ? " " + time : ""}`;
  }

  return (
    <>
      <div className="rounded-2xl border bg-white overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b bg-indigo-50 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-indigo-900">🖥️ Saldo de créditos por servidor</p>
            <p className="text-xs text-indigo-700 mt-0.5">Atualizado a cada renovação • Clique para ajustar</p>
          </div>
          <div className="flex gap-1 bg-white border border-indigo-200 rounded-lg p-0.5">
            {(["ativos", "todos"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition ${
                  filtro === f ? "bg-indigo-600 text-white" : "text-indigo-600 hover:bg-indigo-50"
                }`}
              >
                {f === "ativos" ? "Somente ativos" : "Todos"}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 uppercase">Exibir</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 uppercase">Servidor</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 uppercase">Saldo atual</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 uppercase">Consumo mensal</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 uppercase">Previsão de consumo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 uppercase">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {saldosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-400 text-sm">
                    Nenhum servidor ativo no momento.
                  </td>
                </tr>
              ) : (
                saldosFiltrados.map((s) => {
                  const previsao = previsaoMap[s.id_servidor] ?? null;
                  return (
                    <tr key={s.id_servidor} className={`hover:bg-zinc-50/50 ${!s.exibir_saldo ? "opacity-50" : ""}`}>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleExibir(s)}
                          disabled={togglingId === s.id_servidor}
                          className="flex items-center justify-center w-5 h-5 rounded border transition focus:outline-none focus:ring-2 focus:ring-indigo-400"
                          style={{
                            backgroundColor: s.exibir_saldo ? "#4f46e5" : "#fff",
                            borderColor: s.exibir_saldo ? "#4f46e5" : "#d1d5db",
                          }}
                          title={s.exibir_saldo ? "Ocultar servidor" : "Exibir servidor"}
                        >
                          {s.exibir_saldo && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
                              <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium text-zinc-900">{s.codigo_publico}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${badgeSaldo(s.saldo_atual)}`}>
                          {s.saldo_atual} créditos
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-600 text-xs font-medium">
                        {consumoMap[s.id_servidor] ?? "—"} / mês
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${badgePrevisao(previsao)}`}>
                          {formatPrevisao(previsao)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => abrirModal(s)}
                          className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium transition"
                        >
                          Atualizar saldo
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <div>
                <p className="font-semibold text-zinc-900">Atualizar saldo — {modal.nome}</p>
                <p className="text-xs text-zinc-400 mt-0.5">Saldo atual: <span className="font-bold text-zinc-700">{modal.saldo_atual}</span></p>
              </div>
              <button onClick={() => setModal(null)} className="text-zinc-400 hover:text-zinc-600 text-xl leading-none">×</button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="flex gap-2">
                {(["recarga", "ajuste"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTipo(t)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                      tipo === t
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "border-zinc-300 text-zinc-600 hover:bg-zinc-50"
                    }`}
                  >
                    {t === "recarga" ? "↑ Recarga" : "⇄ Ajuste manual"}
                  </button>
                ))}
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-600 mb-1 block">
                  {tipo === "recarga" ? "Créditos a adicionar" : "Valor do ajuste (positivo ou negativo)"}
                </label>
                <input
                  type="number"
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                  placeholder={tipo === "recarga" ? "ex: 415" : "ex: -10 ou 500"}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-600 mb-1 block">Observação</label>
                <input
                  type="text"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="ex: Compra de 415 créditos em 09/03"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {erro && <p className="text-xs text-red-500">{erro}</p>}

              <div className="flex gap-3 pt-1">
                <button onClick={() => setModal(null)} className="flex-1 py-2 rounded-lg border border-zinc-300 text-sm hover:bg-zinc-50 transition">
                  Cancelar
                </button>
                <button
                  onClick={salvar}
                  disabled={salvando}
                  className="flex-1 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
                >
                  {salvando ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>

            <div className="px-5 pb-5">
              <p className="text-xs font-semibold text-zinc-500 uppercase mb-2">Histórico recente</p>
              {loadingHistorico ? (
                <p className="text-xs text-zinc-400">Carregando...</p>
              ) : historico.length === 0 ? (
                <p className="text-xs text-zinc-400">Nenhum registro ainda.</p>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {historico.map((h) => (
                    <div key={h.id_historico} className="flex items-center justify-between text-xs py-1 border-b border-zinc-50">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${corTipo(h.tipo)}`}>{labelTipo(h.tipo)}</span>
                        <span className="text-zinc-400">{h.observacao ?? "—"}</span>
                        {h.id_assinatura && <span className="text-zinc-300">· assin. #{h.id_assinatura}</span>}
                      </div>
                      <div className="flex items-center gap-3 text-right shrink-0">
                        <span className={h.quantidade < 0 ? "text-red-600 font-semibold" : "text-emerald-600 font-semibold"}>
                          {h.quantidade > 0 ? "+" : ""}{h.quantidade}
                        </span>
                        <span className="text-zinc-400">{h.saldo_anterior} → {h.saldo_novo}</span>
                        <span className="text-zinc-300">{formatData(h.criado_em)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}