// src/components/pagamentos/PagamentosClient.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PagamentoFullRow } from "@/lib/pagamentos";
import PagamentoModal from "./PagamentoModal";

type Props = {
  data: PagamentoFullRow[];
  total: number;
  page: number;
  pageSize: number;
  q: string;
  somentePendentes: boolean;
};

function formatValor(v: string | null) {
  if (!v) return "—";
  const n = parseFloat(v);
  return isNaN(n) ? v : `R$ ${n.toFixed(2).replace(".", ",")}`;
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return d.split("T")[0].split("-").reverse().join("/");
}

function BotaoOK({ id, onDone }: { id: number; onDone: () => void }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/pagamentos/marcar-ok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      const data = await res.json();
      if (data.success) onDone();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="h-8 rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-40 transition-colors"
    >
      {loading ? "..." : "OK"}
    </button>
  );
}

function BotaoExcluir({ id, onDone }: { id: number; onDone: () => void }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    if (!confirm("Excluir este pagamento? Esta ação não pode ser desfeita.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/pagamentos/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) onDone();
      else alert(data.error ?? "Erro ao excluir");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="h-8 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-40 transition-colors"
    >
      {loading ? "..." : "🗑️"}
    </button>
  );
}

const FORMAS = ["PIX", "Nu PJ", "Nubank", "Lotérica", "Dinheiro", "Sicredi", "Caixa", "Banrisul", "Outro"];

function FormaCell({ id, forma, onDone }: { id: number; forma: string | null; onDone: () => void }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(forma ?? "");
  const [saving, setSaving] = useState(false);

  async function salvar(novaForma: string) {
    if (novaForma === (forma ?? "")) { setEditando(false); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/pagamentos/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ forma: novaForma }),
      });
      const data = await res.json();
      if (data.ok) onDone();
      else alert(data.error ?? "Erro ao salvar");
    } finally {
      setSaving(false);
      setEditando(false);
    }
  }

  if (editando) {
    return (
      <select
        autoFocus
        value={valor}
        disabled={saving}
        onChange={(e) => setValor(e.target.value)}
        onBlur={() => salvar(valor)}
        onKeyDown={(e) => {
          if (e.key === "Enter") salvar(valor);
          if (e.key === "Escape") setEditando(false);
        }}
        className="h-7 rounded-lg border border-blue-400 bg-white px-2 text-xs outline-none focus:ring-2 focus:ring-blue-500 transition-all"
      >
        {FORMAS.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
    );
  }

  return (
    <button
      type="button"
      onClick={() => { setValor(forma ?? ""); setEditando(true); }}
      title="Clique para editar"
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 ring-1 ring-blue-600/20 hover:bg-blue-100 transition-colors group"
    >
      {forma ?? <span className="text-zinc-400">—</span>}
      <svg className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" fill="none" viewBox="0 0 12 12">
        <path d="M8 2l2 2-6 6H2V8l6-6z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}

export default function PagamentosClient({
  data,
  total,
  page,
  pageSize,
  q,
  somentePendentes,
}: Props) {
  const [modalPagamento, setModalPagamento] = useState<PagamentoFullRow | null>(null);
  const router = useRouter();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const makeHref = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    p.set("pageSize", String(pageSize));
    p.set("page", String(page));
    if (somentePendentes) p.set("pendentes", "1");

    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") p.delete(k);
      else p.set(k, String(v));
    }
    if (patch.q !== undefined) p.set("page", "1");
    return `/pagamentos?${p.toString()}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">Pagamentos</h1>
          <p className="text-sm text-zinc-600 mt-1">Histórico de pagamentos</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-zinc-900">{total}</p>
          <p className="text-xs text-zinc-500">Total de registros</p>
        </div>
      </div>

      {/* Filtro */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <form className="flex flex-wrap items-center gap-3" method="GET">
          <div className="flex-1 min-w-[240px]">
            <input
              name="q"
              defaultValue={q}
              placeholder="🔍 Buscar por cliente, detalhes ou compra..."
              className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all"
            />
          </div>
          <select
            name="pageSize"
            defaultValue={String(pageSize)}
            className="h-10 rounded-xl border border-zinc-300 bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
          >
            <option value="25">25 por página</option>
            <option value="50">50 por página</option>
            <option value="100">100 por página</option>
            <option value="200">200 por página</option>
          </select>
          {somentePendentes && (
            <input type="hidden" name="pendentes" value="1" />
          )}
          <button
            type="submit"
            className="h-10 rounded-xl bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800 transition-all shadow-sm"
          >
            Aplicar filtros
          </button>
          <Link
            href={makeHref({ pendentes: somentePendentes ? undefined : "1", page: 1 })}
            className={`h-10 rounded-xl border px-4 text-sm font-medium flex items-center transition-all ${somentePendentes
              ? "bg-amber-500 text-white border-amber-500 hover:bg-amber-600"
              : "bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-50"
              }`}
          >
            ⚠️ A conferir
          </Link>
          {(q || somentePendentes) && (
            <Link
              href="/pagamentos"
              className="h-10 rounded-xl border border-zinc-300 bg-white px-5 text-sm font-medium hover:bg-zinc-50 flex items-center transition-all"
            >
              ✕ Limpar
            </Link>
          )}
        </form>
      </div>

      {/* Tabela */}
      <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
        <div className="max-h-[calc(100vh-300px)] overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-gradient-to-b from-zinc-50 to-white">
                {["Data", "Cliente", "Forma", "Valor", "Tipo", "Compra", "Detalhes", ""].map((h) => (
                  <th
                    key={h}
                    className="sticky top-0 z-10 bg-gradient-to-b from-zinc-50 to-white border-b border-zinc-200 px-6 py-4 text-left text-xs font-semibold text-zinc-700 uppercase tracking-wider"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {data.map((p) => {
                const isPendente = p.detalhes !== "OK";
                return (
                  <tr key={p.id} className="hover:bg-zinc-50/50 transition-colors">
                    <td className="px-6 py-4 font-medium text-zinc-900 whitespace-nowrap">
                      {formatDate(p.data_pgto)}
                    </td>
                    <td className="px-6 py-4">
                      {p.nome_cliente ? (
                        <Link
                          href={`/clientes/${p.id_cliente}`}
                          className="font-medium text-zinc-900 hover:text-zinc-600 transition-colors"
                        >
                          {p.nome_cliente}
                        </Link>
                      ) : (
                        <span className="text-zinc-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <FormaCell id={p.id} forma={p.forma} onDone={() => router.refresh()} />
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-semibold text-emerald-700">
                        {formatValor(p.valor)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-zinc-600 text-xs">{p.tipo ?? "—"}</td>
                    <td className="px-6 py-4 text-zinc-600 text-xs">{p.compra ?? "—"}</td>
                    <td className="px-6 py-4 max-w-xs">
                      <span
                        className="text-zinc-600 text-xs truncate block"
                        title={p.detalhes ?? ""}
                      >
                        {p.detalhes || "—"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {isPendente && (
                          <BotaoOK id={p.id} onDone={() => router.refresh()} />
                        )}
                        <button
                          onClick={() => setModalPagamento(p)}
                          className="h-8 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium hover:bg-zinc-50 transition-colors"
                        >
                          ✏️ Editar
                        </button>
                        {isPendente && (
                          <BotaoExcluir id={p.id} onDone={() => router.refresh()} />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {data.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-16 text-center text-zinc-500">
                    <div className="flex flex-col items-center gap-2">
                      <div className="text-4xl">💰</div>
                      <div className="font-medium">Nenhum pagamento encontrado</div>
                      <div className="text-xs text-zinc-400">Tente ajustar os filtros</div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Paginação */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
        <div className="text-sm text-zinc-600">
          Mostrando{" "}
          <span className="font-semibold text-zinc-900">{data.length}</span> de{" "}
          <span className="font-semibold text-zinc-900">{total}</span> pagamentos
          <span className="text-zinc-400 mx-2">•</span>
          Página{" "}
          <span className="font-semibold text-zinc-900">{page}</span> de{" "}
          <span className="font-semibold text-zinc-900">{totalPages}</span>
        </div>
        <div className="flex items-center gap-2">
          {[
            { label: "« Primeira", pg: 1, dis: page <= 1 },
            { label: "← Anterior", pg: page - 1, dis: page <= 1 },
            { label: "Próxima →", pg: page + 1, dis: page >= totalPages },
            { label: "Última »", pg: totalPages, dis: page >= totalPages },
          ].map(({ label, pg, dis }) => (
            <Link
              key={label}
              href={makeHref({ page: pg })}
              aria-disabled={dis}
              className={`h-10 rounded-xl border bg-white px-4 text-sm font-medium hover:bg-zinc-50 flex items-center transition-all shadow-sm ${dis ? "pointer-events-none opacity-40" : ""
                }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {modalPagamento && (
        <PagamentoModal
          pagamento={modalPagamento}
          onClose={() => setModalPagamento(null)}
          onSaved={() => {
            router.refresh();
            setModalPagamento(null);
          }}
        />
      )}
    </div>
  );
}