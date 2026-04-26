"use client";

import { useState, useRef, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { buscarClientes, type ClienteBuscaRow } from "@/app/actions/buscarClientes";
import { vincularConta, desvincularConta, excluirConta } from "@/app/actions/vincularConta";
import type { ContaVinculacao } from "@/app/(dashboard)/servidores/vinculacao/page";

const inputClass =
  "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900 transition-all";

function formatDate(d: string | null) {
  if (!d) return "—";
  return d.split("-").reverse().join("/");
}

function useClienteSearch(onSelect?: (clienteId: number) => void) {
  const [busca, setBusca] = useState("");
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [clienteNome, setClienteNome] = useState("");
  const [resultados, setResultados] = useState<ClienteBuscaRow[]>([]);
  const [aberto, setAberto] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback((valor: string) => {
    setBusca(valor);
    setClienteId(null);
    setActiveIdx(-1);
    setAberto(true);
    if (!valor.trim()) { setResultados([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setResultados(await buscarClientes(valor));
    }, 300);
  }, []);

  const selecionar = useCallback((c: ClienteBuscaRow) => {
    const id = Number(c.id_cliente);
    setClienteId(id);
    setClienteNome(c.nome);
    setBusca(c.nome);
    setResultados([]);
    setAberto(false);
    setActiveIdx(-1);
    onSelect?.(id);
  }, [onSelect]);

  const limpar = useCallback(() => {
    setClienteId(null);
    setClienteNome("");
    setBusca("");
    setResultados([]);
    setAberto(false);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!aberto || !resultados.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, resultados.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (activeIdx >= 0) selecionar(resultados[activeIdx]); }
    else if (e.key === "Escape") setAberto(false);
  }, [aberto, resultados, activeIdx, selecionar]);

  return { busca, clienteId, clienteNome, resultados, aberto, activeIdx, handleChange, selecionar, limpar, handleKeyDown, setAberto };
}

function PlanoAtual({ contrato, status, nomeServidor }: { contrato: string | null; status: string | null; nomeServidor: string }) {
  if (!contrato) return <span className="text-zinc-300 text-xs">—</span>;

  const servidorNorm = nomeServidor.toLowerCase();
  const contratoNorm = contrato.toLowerCase();
  const bate = contratoNorm.includes(servidorNorm) || servidorNorm.includes(contratoNorm);

  const statusColor =
    status === "ativo" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
    status === "atrasado" ? "bg-orange-50 text-orange-700 border-orange-200" :
    "bg-zinc-50 text-zinc-500 border-zinc-200";

  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${statusColor} ${!bate ? "ring-1 ring-red-300" : ""}`}>
      {contrato}
      {!bate && <span className="text-red-400" title="Servidor diferente do plano atual">⚠</span>}
    </span>
  );
}

function SugestaoInline({ conta, onDone, onEditar }: { conta: ContaVinculacao; onDone: () => void; onEditar: () => void }) {
  const [isPending, startTransition] = useTransition();

  function confirmar() {
    startTransition(async () => {
      await vincularConta(conta.id_conta, conta.sugestao_id_cliente!);
      onDone();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-blue-700">{conta.sugestao_nome_cliente}</span>
      <button
        onClick={confirmar}
        disabled={isPending}
        className="h-6 rounded-md bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40 whitespace-nowrap"
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

function VincularInline({ conta, onDone }: { conta: ContaVinculacao; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();

  const salvar = useCallback((clienteId: number) => {
    startTransition(async () => {
      await vincularConta(conta.id_conta, clienteId);
      onDone();
    });
  }, [conta.id_conta, onDone]);

  const search = useClienteSearch(salvar);

  return (
    <div className="flex items-start gap-2">
      <div className="relative flex-1">
        <input
          value={search.busca}
          onChange={(e) => search.handleChange(e.target.value)}
          onFocus={() => search.busca && search.setAberto(true)}
          onKeyDown={search.handleKeyDown}
          className={inputClass}
          placeholder="Buscar cliente..."
          autoFocus
          disabled={isPending}
        />
        {search.aberto && search.resultados.length > 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden">
            {search.resultados.map((c, idx) => (
              <button
                key={c.id_cliente}
                type="button"
                onMouseDown={() => search.selecionar(c)}
                className={`w-full text-left px-4 py-2 text-sm flex justify-between transition-colors ${
                  idx === search.activeIdx ? "bg-zinc-100" : "hover:bg-zinc-50"
                }`}
              >
                <span className="font-medium">{c.nome}</span>
                <span className="text-xs text-zinc-400">ID {c.id_cliente}</span>
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

export default function VinculacaoClient({ contas }: { contas: ContaVinculacao[] }) {
  const router = useRouter();
  const [vinculandoId, setVinculandoId] = useState<number | null>(null);
  const [filtro, setFiltro] = useState<"todos" | "sem" | "com">("sem");
  const [busca, setBusca] = useState("");
  const [isPending, startTransition] = useTransition();

  const contasFiltradas = contas.filter((c) => {
    if (filtro === "sem" && c.id_cliente) return false;
    if (filtro === "com" && !c.id_cliente) return false;
    if (busca.trim()) {
      const q = busca.toLowerCase();
      return (
        c.usuario.toLowerCase().includes(q) ||
        c.rotulo?.toLowerCase().includes(q) ||
        c.nome_cliente?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  function handleDesvincular(idConta: number) {
    if (!confirm("Remover vínculo desta conta?")) return;
    startTransition(async () => {
      await desvincularConta(idConta);
      router.refresh();
    });
  }

  function handleExcluir(idConta: number, usuario: string) {
    if (!confirm(`Excluir permanentemente a conta "${usuario}" do banco de dados?`)) return;
    startTransition(async () => {
      await excluirConta(idConta);
      router.refresh();
    });
  }

  const servidores = [...new Set(contas.map((c) => c.nome_servidor))];

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex rounded-lg border border-zinc-200 overflow-hidden text-sm">
          {(["todos", "sem", "com"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-4 py-2 font-medium transition-colors ${
                filtro === f ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {f === "todos" ? "Todos" : f === "sem" ? "Sem vínculo" : "Vinculados"}
            </button>
          ))}
        </div>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="🔍 Filtrar por usuário, rótulo ou cliente..."
          className="flex-1 min-w-52 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-zinc-900"
        />
        <span className="text-sm text-zinc-400">{contasFiltradas.length} conta{contasFiltradas.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Tabela por servidor */}
      {servidores.map((servidor) => {
        const linhas = contasFiltradas.filter((c) => c.nome_servidor === servidor);
        if (!linhas.length) return null;
        return (
          <div key={servidor} className="rounded-2xl border bg-white overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b bg-zinc-50 flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-700">{servidor}</span>
              <span className="text-xs text-zinc-400">{linhas.length} conta{linhas.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-zinc-50/50">
                  <tr>
                    {["Usuário", "Rótulo (painel)", "Servidor", "Vencimento", "Cliente vinculado", "Pacote atual", ""].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {linhas.map((c) => (
                    <tr key={c.id_conta} className="hover:bg-zinc-50/50">
                      <td className="px-4 py-3 font-mono text-xs text-zinc-700">{c.usuario}</td>
                      <td className="px-4 py-3 text-zinc-800">{c.rotulo || <span className="text-zinc-400 italic">sem rótulo</span>}</td>
                      <td className="px-4 py-3 text-zinc-600 text-xs">{c.nome_servidor}</td>
                      <td className={`px-4 py-3 text-xs font-medium ${c.vencimento_real_painel && c.vencimento_real_painel < new Date().toISOString().slice(0, 10) ? "text-red-600" : "text-zinc-600"}`}>
                        {formatDate(c.vencimento_real_painel)}
                      </td>
                      <td className="px-4 py-3 min-w-64">
                        {vinculandoId === c.id_conta ? (
                          <VincularInline
                            conta={c}
                            onDone={() => { setVinculandoId(null); router.refresh(); }}
                          />
                        ) : c.id_cliente ? (
                          <a
                            href={`/clientes/${c.id_cliente}`}
                            className="font-medium text-zinc-900 hover:underline"
                          >
                            {c.nome_cliente}
                          </a>
                        ) : c.sugestao_id_cliente ? (
                          <SugestaoInline conta={c} onDone={() => router.refresh()} onEditar={() => setVinculandoId(c.id_conta)} />
                        ) : (
                          <span className="text-zinc-400 text-xs italic">não vinculado</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <PlanoAtual contrato={c.pacote_contrato} status={c.pacote_status} nomeServidor={c.nome_servidor} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-end">
                          {vinculandoId !== c.id_conta && !c.sugestao_id_cliente && (
                            c.id_cliente ? (
                              <button
                                onClick={() => handleDesvincular(c.id_conta)}
                                disabled={isPending}
                                className="h-7 rounded-md border border-zinc-200 px-2.5 text-xs text-zinc-500 hover:border-red-300 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                              >
                                Desvincular
                              </button>
                            ) : (
                              <button
                                onClick={() => setVinculandoId(c.id_conta)}
                                className="h-7 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-700 transition-colors"
                              >
                                Vincular
                              </button>
                            )
                          )}
                          <button
                            onClick={() => handleExcluir(c.id_conta, c.usuario)}
                            disabled={isPending}
                            className="h-7 rounded-md border border-zinc-200 px-2.5 text-xs text-zinc-400 hover:border-red-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40"
                            title="Excluir do banco"
                          >
                            🗑
                          </button>
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
          Nenhuma conta encontrada para os filtros aplicados.
        </div>
      )}
    </div>
  );
}
