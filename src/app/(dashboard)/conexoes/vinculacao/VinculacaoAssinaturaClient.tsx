"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  vincularContaAssinatura,
  desvincularContaAssinatura,
  buscarAssinaturas,
  type AssinaturaBuscaRow,
} from "@/app/actions/vincularContaAssinatura";
import type { ContaVinculacaoAssinatura } from "./page";

const inputClass =
  "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900 transition-all";

function formatDate(d: string | null) {
  if (!d) return "—";
  return d.slice(0, 10).split("-").reverse().join("/");
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-zinc-400 italic">sem match</span>;
  const pct = Math.round(score * 100);
  const cor =
    score >= 0.7 ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
    score >= 0.4 ? "bg-amber-50 text-amber-700 border-amber-200" :
                   "bg-red-50 text-red-600 border-red-200";
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${cor}`}>
      {pct}%
    </span>
  );
}

function SugestaoInline({
  conta,
  onDone,
  onEditar,
}: {
  conta: ContaVinculacaoAssinatura;
  onDone: () => void;
  onEditar: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  function confirmar() {
    startTransition(async () => {
      await vincularContaAssinatura(conta.id_conta, conta.sugestao_id_assinatura!);
      onDone();
    });
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Link
        href={`/clientes/${conta.sugestao_id_cliente}`}
        className="text-sm font-medium text-zinc-800 hover:underline"
      >
        {conta.sugestao_nome_cliente}
      </Link>
      <ScoreBadge score={conta.score} />
      <button
        onClick={confirmar}
        disabled={isPending}
        className="h-6 rounded-md bg-zinc-900 px-2.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-40 whitespace-nowrap"
      >
        {isPending ? "..." : "Confirmar"}
      </button>
      <button
        onClick={onEditar}
        disabled={isPending}
        className="h-6 rounded-md border border-zinc-200 px-2 text-xs text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"
      >
        Trocar
      </button>
    </div>
  );
}

function VincularInline({
  conta,
  onDone,
}: {
  conta: ContaVinculacaoAssinatura;
  onDone: () => void;
}) {
  const [busca, setBusca] = useState("");
  const [resultados, setResultados] = useState<AssinaturaBuscaRow[]>([]);
  const [aberto, setAberto] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(valor: string) {
    setBusca(valor);
    setActiveIdx(-1);
    setAberto(true);
    if (!valor.trim()) { setResultados([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setResultados(await buscarAssinaturas(valor));
    }, 300);
  }

  function selecionar(row: AssinaturaBuscaRow) {
    setAberto(false);
    setResultados([]);
    startTransition(async () => {
      await vincularContaAssinatura(conta.id_conta, row.id_assinatura);
      onDone();
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!aberto || !resultados.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, resultados.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (activeIdx >= 0) selecionar(resultados[activeIdx]); }
    else if (e.key === "Escape") onDone();
  }

  return (
    <div className="flex items-start gap-2">
      <div className="relative flex-1">
        <input
          value={busca}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => busca && setAberto(true)}
          onKeyDown={handleKeyDown}
          className={inputClass}
          placeholder="Buscar cliente..."
          autoFocus
          disabled={isPending}
        />
        {aberto && resultados.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden">
            {resultados.map((r, idx) => (
              <button
                key={r.id_assinatura}
                type="button"
                onMouseDown={() => selecionar(r)}
                className={`w-full text-left px-4 py-2 text-sm flex justify-between gap-3 transition-colors ${
                  idx === activeIdx ? "bg-zinc-100" : "hover:bg-zinc-50"
                }`}
              >
                <span className="font-medium truncate">{r.nome_cliente}</span>
                <span className="text-xs text-zinc-400 whitespace-nowrap">
                  venc. {formatDate(r.venc_contas)} · #{r.id_assinatura}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={onDone}
        disabled={isPending}
        className="h-9 rounded-lg border border-zinc-300 px-3 text-sm hover:bg-zinc-50 disabled:opacity-40"
      >
        {isPending ? "..." : "✕"}
      </button>
    </div>
  );
}

export default function VinculacaoAssinaturaClient({
  contas,
}: {
  contas: ContaVinculacaoAssinatura[];
}) {
  const router = useRouter();
  const [vinculandoId, setVinculandoId] = useState<number | null>(null);
  const [filtro, setFiltro] = useState<"sem" | "com" | "todos">("sem");
  const [busca, setBusca] = useState("");
  const [isPending, startTransition] = useTransition();

  const contasFiltradas = contas.filter((c) => {
    if (filtro === "sem" && c.id_assinatura) return false;
    if (filtro === "com" && !c.id_assinatura) return false;
    if (busca.trim()) {
      const q = busca.toLowerCase();
      return (
        c.usuario.toLowerCase().includes(q) ||
        (c.rotulo ?? "").toLowerCase().includes(q) ||
        (c.sugestao_nome_cliente ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const paineis = [...new Set(contas.map((c) => c.nome_painel))];

  function handleDesvincular(idConta: number) {
    if (!confirm("Remover vínculo desta conta?")) return;
    startTransition(async () => {
      try {
        await desvincularContaAssinatura(idConta);
        router.refresh();
      } catch {
        alert("Erro ao desvincular conta.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex rounded-lg border border-zinc-200 overflow-hidden text-sm">
          {(["sem", "com", "todos"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-4 py-2 font-medium transition-colors ${
                filtro === f ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {f === "sem" ? "Sem vínculo" : f === "com" ? "Vinculadas" : "Todos"}
            </button>
          ))}
        </div>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="🔍 Filtrar por usuário, rótulo ou cliente..."
          className="flex-1 min-w-52 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900"
        />
        <span className="text-sm text-zinc-400">
          {contasFiltradas.length} conta{contasFiltradas.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Tabela por painel */}
      {paineis.map((painel) => {
        const linhas = contasFiltradas.filter((c) => c.nome_painel === painel);
        if (!linhas.length) return null;
        return (
          <div key={painel} className="rounded-2xl border bg-white overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b bg-zinc-50 flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-700">{painel}</span>
              <span className="text-xs text-zinc-400">
                {linhas.length} conta{linhas.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-zinc-50/50">
                  <tr>
                    {["Usuário", "Rótulo", "Vencimento", "Assinatura vinculada", ""].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {linhas.map((c) => (
                    <tr key={c.id_conta} className="hover:bg-zinc-50/50">
                      <td className="px-4 py-3 font-mono text-xs text-zinc-700 whitespace-nowrap">
                        {c.usuario}
                      </td>
                      <td className="px-4 py-3 text-zinc-800 max-w-48 truncate">
                        {c.rotulo || <span className="text-zinc-400 italic text-xs">sem rótulo</span>}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-zinc-600 whitespace-nowrap">
                        {formatDate(c.vencimento_real_painel)}
                      </td>
                      <td className="px-4 py-3 min-w-72">
                        {vinculandoId === c.id_conta ? (
                          <VincularInline
                            conta={c}
                            onDone={() => { setVinculandoId(null); router.refresh(); }}
                          />
                        ) : c.id_assinatura ? (
                          <Link
                            href={`/clientes/${c.id_cliente_vinculado}`}
                            className="text-sm font-medium text-emerald-700 hover:underline"
                          >
                            {c.nome_cliente_vinculado ?? `Assinatura #${c.id_assinatura}`}
                          </Link>
                        ) : c.sugestao_id_assinatura ? (
                          <SugestaoInline
                            conta={c}
                            onDone={() => router.refresh()}
                            onEditar={() => setVinculandoId(c.id_conta)}
                          />
                        ) : (
                          <span className="text-zinc-400 text-xs italic">sem sugestão</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-end">
                          {vinculandoId !== c.id_conta && (
                            c.id_assinatura ? (
                              <button
                                onClick={() => handleDesvincular(c.id_conta)}
                                disabled={isPending}
                                className="h-7 rounded-md border border-zinc-200 px-2.5 text-xs text-zinc-500 hover:border-red-300 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                              >
                                Desvincular
                              </button>
                            ) : !c.sugestao_id_assinatura ? (
                              <button
                                onClick={() => setVinculandoId(c.id_conta)}
                                className="h-7 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-700 transition-colors"
                              >
                                Vincular
                              </button>
                            ) : (
                              <button
                                onClick={() => setVinculandoId(c.id_conta)}
                                className="h-7 rounded-md border border-zinc-200 px-2 text-xs text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 transition-colors"
                              >
                                Trocar
                              </button>
                            )
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {contasFiltradas.length === 0 && (
        <div className="rounded-2xl border bg-white p-12 text-center text-zinc-400 text-sm">
          Nenhuma conta encontrada.
        </div>
      )}
    </div>
  );
}
