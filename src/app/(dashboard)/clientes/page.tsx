// src/app/(dashboard)/clientes/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import {
  countClientes,
  getClientes,
  type ClienteStatusTela,
  type DueFilter,
} from "@/lib/clientes";
import RowActions from "@/components/clientes/RowActions";

function badgeClass(status: ClienteStatusTela) {
  switch (status) {
    case "atrasado":
      return "bg-red-50 text-red-700 ring-1 ring-red-600/20";
    case "sem_assinatura":
      return "bg-zinc-50 text-zinc-700 ring-1 ring-zinc-600/20";
    default:
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20";
  }
}

function badgeLabel(status: ClienteStatusTela) {
  switch (status) {
    case "atrasado":
      return "Atrasado";
    case "sem_assinatura":
      return "Sem assinatura";
    default:
      return "OK";
  }
}

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function toStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function toInt(v: unknown, fallback: number): number {
  const n = Number(typeof v === "string" ? v : "");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function tabClass(active: boolean) {
  return active
    ? "rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all"
    : "rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-all";
}

export default async function ClientesPage({ searchParams }: PageProps) {
  const sp = (await searchParams) ?? {};

  const q = toStr(sp.q);
  const status = (toStr(sp.status) as "todos" | ClienteStatusTela) || "todos";
  const order = (toStr(sp.order) as "nome" | "vencimento") || "nome";
  const due = (toStr(sp.due) as DueFilter) || "todos";

  const page = toInt(sp.page, 1);
  const pageSize = toInt(sp.pageSize, 50);

  const [total, data] = await Promise.all([
    countClientes({ q, status, order, due }),
    getClientes({ q, status, order, page, pageSize, due }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const makeHref = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();

    if (q) p.set("q", q);
    if (status && status !== "todos") p.set("status", status);
    if (order && order !== "nome") p.set("order", order);
    if (due && due !== "todos") p.set("due", due);

    p.set("pageSize", String(pageSize));
    p.set("page", String(page));

    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") p.delete(k);
      else p.set(k, String(v));
    }

    if (patch.q !== undefined || patch.status !== undefined || patch.order !== undefined || patch.due !== undefined) {
      p.set("page", "1");
    }

    return `/clientes?${p.toString()}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900">Clientes</h1>
            <p className="text-sm text-zinc-600 mt-1">
              Gerencie seus clientes e assinaturas
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-2xl font-bold text-zinc-900">{total}</p>
              <p className="text-xs text-zinc-500">Total de clientes</p>
            </div>
          </div>
        </div>

        {/* Guias de vencimento */}
        <div className="flex flex-wrap gap-2">
          <Link href={makeHref({ due: "ontem" })} className={tabClass(due === "ontem")}>
            🔴 Vencidos (ontem)
          </Link>
          <Link href={makeHref({ due: "hoje" })} className={tabClass(due === "hoje")}>
            🟡 Vencem hoje
          </Link>
          <Link href={makeHref({ due: "amanha" })} className={tabClass(due === "amanha")}>
            🟢 Vencem amanhã
          </Link>
          <Link href={makeHref({ due: "todos" })} className={tabClass(due === "todos")}>
            📋 Todos
          </Link>
        </div>

        {/* Filtros */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <form className="flex flex-wrap items-center gap-3" method="GET">
            <input type="hidden" name="due" value={due} />

            <div className="flex-1 min-w-[240px]">
              <input
                name="q"
                defaultValue={q}
                placeholder="🔍 Buscar por nome ou observação..."
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent transition-all"
              />
            </div>

            <select
              name="status"
              defaultValue={status}
              className="h-10 rounded-xl border border-zinc-300 bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
            >
              <option value="todos">Todos os status</option>
              <option value="ok">✅ OK</option>
              <option value="atrasado">❌ Atrasado</option>
              <option value="sem_assinatura">⚠️ Sem assinatura</option>
            </select>

            <select
              name="order"
              defaultValue={order}
              className="h-10 rounded-xl border border-zinc-300 bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
            >
              <option value="nome">📝 Ordenar por nome</option>
              <option value="vencimento">📅 Ordenar por vencimento</option>
            </select>

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

            <button
              type="submit"
              className="h-10 rounded-xl bg-zinc-900 px-6 text-sm font-medium text-white hover:bg-zinc-800 transition-all shadow-sm"
            >
              Aplicar filtros
            </button>

            {(q || status !== "todos" || order !== "nome" || pageSize !== 50 || due !== "todos") && (
              <Link
                href="/clientes"
                className="h-10 rounded-xl border border-zinc-300 bg-white px-6 text-sm font-medium hover:bg-zinc-50 flex items-center transition-all"
              >
                ✕ Limpar
              </Link>
            )}
          </form>
        </div>
      </div>

      {/* Tabela */}
      <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden shadow-sm">
        <div className="max-h-[calc(100vh-300px)] overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-gradient-to-b from-zinc-50 to-white">
                <th className="sticky top-0 z-10 bg-gradient-to-b from-zinc-50 to-white border-b border-zinc-200 px-6 py-4 text-left text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                  Nome
                </th>
                <th className="sticky top-0 z-10 bg-gradient-to-b from-zinc-50 to-white border-b border-zinc-200 px-6 py-4 text-left text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                  Pacote
                </th>
                <th className="sticky top-0 z-10 bg-gradient-to-b from-zinc-50 to-white border-b border-zinc-200 px-6 py-4 text-left text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                  Vencimento
                </th>
                <th className="sticky top-0 z-10 bg-gradient-to-b from-zinc-50 to-white border-b border-zinc-200 px-6 py-4 text-left text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                  Status
                </th>
                <th className="sticky top-0 z-10 bg-gradient-to-b from-zinc-50 to-white border-b border-zinc-200 px-6 py-4 text-left text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                  Observação
                </th>
                <th className="sticky top-0 z-10 bg-gradient-to-b from-zinc-50 to-white border-b border-zinc-200 px-6 py-4 text-right text-xs font-semibold text-zinc-700 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100">
              {data.map((c) => (
                <tr key={c.id_cliente} className="hover:bg-zinc-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <Link
                      href={`/clientes/${c.id_cliente}`}
                      className="font-semibold text-zinc-900 hover:text-zinc-600 transition-colors"
                    >
                      {c.nome}
                    </Link>
                    <div className="text-xs text-zinc-500 mt-0.5">ID: {c.id_cliente}</div>
                  </td>

                  <td className="px-6 py-4">
                    {c.pacote_nome ? (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700 ring-1 ring-blue-600/20">
                        {c.pacote_nome}
                      </span>
                    ) : (
                      <span className="text-zinc-400 text-xs">—</span>
                    )}
                  </td>

                  <td className="px-6 py-4">
                    {c.prox_vencimento ? (
                      <div className="text-sm font-medium text-zinc-900">
                        {new Date(c.prox_vencimento).toLocaleDateString('pt-BR')}
                      </div>
                    ) : (
                      <span className="text-zinc-400 text-xs">—</span>
                    )}
                  </td>

                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${badgeClass(
                        c.status_tela
                      )}`}
                    >
                      {badgeLabel(c.status_tela)}
                    </span>
                  </td>

                  <td className="px-6 py-4 max-w-xs">
                    {c.observacao ? (
                      <div className="text-sm text-zinc-600 truncate" title={c.observacao}>
                        {c.observacao}
                      </div>
                    ) : (
                      <span className="text-zinc-400 text-xs">—</span>
                    )}
                  </td>

                  <td className="px-6 py-4">
                    <RowActions
                      idCliente={c.id_cliente}
                      nome={c.nome}
                      telefone={c.telefone ?? null}
                      observacao={c.observacao ?? null}
                    />
                  </td>
                </tr>
              ))}

              {data.length === 0 && (
                <tr>
                  <td className="px-6 py-16 text-center text-zinc-500" colSpan={6}>
                    <div className="flex flex-col items-center gap-2">
                      <div className="text-4xl">🔍</div>
                      <div className="font-medium">Nenhum cliente encontrado</div>
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
          Mostrando <span className="font-semibold text-zinc-900">{data.length}</span> de{" "}
          <span className="font-semibold text-zinc-900">{total}</span> clientes
          <span className="text-zinc-400 mx-2">•</span>
          Página <span className="font-semibold text-zinc-900">{page}</span> de{" "}
          <span className="font-semibold text-zinc-900">{totalPages}</span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            aria-disabled={page <= 1}
            className={`h-10 rounded-xl border bg-white px-4 text-sm font-medium hover:bg-zinc-50 flex items-center gap-2 transition-all shadow-sm ${page <= 1 ? "pointer-events-none opacity-40" : ""
              }`}
            href={makeHref({ page: 1 })}
          >
            <span className="hidden sm:inline">«</span> Primeira
          </Link>

          <Link
            aria-disabled={page <= 1}
            className={`h-10 rounded-xl border bg-white px-4 text-sm font-medium hover:bg-zinc-50 flex items-center gap-2 transition-all shadow-sm ${page <= 1 ? "pointer-events-none opacity-40" : ""
              }`}
            href={makeHref({ page: page - 1 })}
          >
            ← Anterior
          </Link>

          <Link
            aria-disabled={page >= totalPages}
            className={`h-10 rounded-xl border bg-white px-4 text-sm font-medium hover:bg-zinc-50 flex items-center gap-2 transition-all shadow-sm ${page >= totalPages ? "pointer-events-none opacity-40" : ""
              }`}
            href={makeHref({ page: page + 1 })}
          >
            Próxima →
          </Link>

          <Link
            aria-disabled={page >= totalPages}
            className={`h-10 rounded-xl border bg-white px-4 text-sm font-medium hover:bg-zinc-50 flex items-center gap-2 transition-all shadow-sm ${page >= totalPages ? "pointer-events-none opacity-40" : ""
              }`}
            href={makeHref({ page: totalPages })}
          >
            Última <span className="hidden sm:inline">»</span>
          </Link>
        </div>
      </div>
    </div>
  );
}