"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useRef } from "react";

const STATUS_TABS = [
  { value: "todos", label: "Todos" },
  { value: "ativo", label: "✅ Ativo" },
  { value: "pendente", label: "🔵 Pendente" },
  { value: "atrasado", label: "🟡 Atrasado" },
  { value: "vencido", label: "🟠 Vencido" },
  { value: "inativo", label: "⚪ Inativo" },
  { value: "cancelado", label: "🔴 Cancelado" },
  { value: "sem_assinatura", label: "⚠️ Sem assinatura" },
];

const DUE_TABS = [
  { value: "ontem", label: "🔴 Ontem" },
  { value: "hoje", label: "🟡 Hoje" },
  { value: "amanha", label: "🟢 Amanhã" },
  { value: "todos", label: "📋 Todos" },
];

type Props = {
  q: string;
  status: string;
  due: string;
};

export default function ClientesFiltros({ q, status, due }: Props) {
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function navigate(patch: Record<string, string>) {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status && status !== "todos") p.set("status", status);
    if (due && due !== "todos") p.set("due", due);
    p.set("page", "1");
    for (const [k, v] of Object.entries(patch)) {
      if (!v || v === "todos") p.delete(k);
      else p.set(k, v);
    }
    router.push(`/clientes?${p.toString()}`);
  }

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => navigate({ q: val, status, due }), 400);
  }, [status, due]);

  const tabClass = (active: boolean) =>
    active
      ? "rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-all"
      : "rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-50 transition-all";

  const hasFilters = q || status !== "todos" || due !== "todos";

  return (
    <div className="space-y-3">
      {/* Linha 1: busca + tabs de vencimento */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[220px]">
          <input
            type="text"
            defaultValue={q}
            onChange={handleSearch}
            placeholder="Buscar por nome ou observação..."
            className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DUE_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => navigate({ due: t.value })}
              className={tabClass(due === t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={() => router.push("/clientes")}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50 transition-all"
          >
            ✕ Limpar
          </button>
        )}
      </div>

      {/* Linha 2: tabs de status */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => navigate({ status: t.value })}
            className={tabClass(status === t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}