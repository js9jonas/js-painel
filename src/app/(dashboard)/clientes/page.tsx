// src/app/(dashboard)/clientes/page.tsx
export const dynamic = "force-dynamic";
import SearchInput from "@/components/clientes/SearchInput";
import Link from "next/link";
import {
  countClientes,
  getClientes,
  type ClienteStatusTela,
  type DueFilter,
} from "@/lib/clientes";
import { getPlanos } from "@/lib/planos";
import { getPacotes } from "@/lib/pacotes";
import RowActions from "@/components/clientes/RowActions";
import NovoClienteButton from "@/components/clientes/NovoClienteButton";
import CortesiasIndicacaoPanel from "@/components/clientes/CortesiasIndicacaoPanel";
import { getParceirosComCortesiaPendente } from "@/lib/indicacoes";
import ClientesFiltros from "@/components/clientes/ClientesFiltros";

// ✅ Cores dos badges alinhadas ao modelo de status
function badgeClass(status: ClienteStatusTela) {
  switch (status) {
    case "ativo":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20";
    case "pendente":
      return "bg-blue-50 text-blue-700 ring-1 ring-blue-600/20";
    case "atrasado":
      return "bg-yellow-50 text-yellow-700 ring-1 ring-yellow-600/20";
    case "vencido":
      return "bg-orange-50 text-orange-700 ring-1 ring-orange-600/20";
    case "inativo":
      return "bg-zinc-100 text-zinc-500 ring-1 ring-zinc-400/20";
    case "cancelado":
      return "bg-red-50 text-red-700 ring-1 ring-red-600/20";
    case "sem_assinatura":
      return "bg-zinc-50 text-zinc-500 ring-1 ring-zinc-400/20";
  }
}

// ✅ Rótulos dos badges
function badgeLabel(status: ClienteStatusTela) {
  switch (status) {
    case "ativo": return "✅ Ativo";
    case "pendente": return "🔵 Pendente";
    case "atrasado": return "🟡 Atrasado";
    case "vencido": return "🟠 Vencido";
    case "inativo": return "⚪ Inativo";
    case "cancelado": return "🔴 Cancelado";
    case "sem_assinatura": return "⚠️ Sem assinatura";
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
  const order = (toStr(sp.order) as "nome" | "vencimento") || "vencimento";
  const due = (toStr(sp.due) as DueFilter) || "todos";

  const page = toInt(sp.page, 1);
  const pageSize = toInt(sp.pageSize, 50);

  const [total, data, planos, pacotes, parceirosComCortesia] = await Promise.all([
    countClientes({ q, status, order, due }),
    getClientes({ q, status, order, page, pageSize, due }),
    getPlanos(),
    getPacotes(),
    getParceirosComCortesiaPendente(),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const makeHref = (patch: Record<string, string | number | undefined>) => {
    const p = new URLSearchParams();

    if (q) p.set("q", q);
    if (status && status !== "todos") p.set("status", status);
    if (order && order !== "vencimento") p.set("order", order);
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
            <NovoClienteButton planos={planos} pacotes={pacotes} />
          </div>
        </div>
        

      </div>
      <ClientesFiltros q={q} status={status} due={due} />
      <CortesiasIndicacaoPanel parceiros={parceirosComCortesia} />
     

      {/* Tabela */ }
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
                    {new Date(c.prox_vencimento).toLocaleDateString("pt-BR")}
                  </div>
                ) : (
                  <span className="text-zinc-400 text-xs">—</span>
                )}
              </td>

              <td className="px-6 py-4">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${badgeClass(c.status_tela)}`}>
                  {badgeLabel(c.status_tela)}
                </span>
              </td>

              <td className="px-6 py-4 max-w-xs">
                {(c.observacao || c.observacao_assinatura) ? (
                  <div className="text-sm text-zinc-600 truncate"
                    title={[c.observacao, c.observacao_assinatura].filter(Boolean).join(" • ")}>
                    {[c.observacao, c.observacao_assinatura].filter(Boolean).join(" • ")}
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
                  observacaoAssinatura={c.observacao_assinatura ?? null}
                  idAssinaturaPrincipal={c.id_assinatura_principal ?? null}
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

  {/* Paginação */ }
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
        className={`h-10 rounded-xl border bg-white px-4 text-sm font-medium hover:bg-zinc-50 flex items-center gap-2 transition-all shadow-sm ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
        href={makeHref({ page: 1 })}
      >
        <span className="hidden sm:inline">«</span> Primeira
      </Link>
      <Link
        aria-disabled={page <= 1}
        className={`h-10 rounded-xl border bg-white px-4 text-sm font-medium hover:bg-zinc-50 flex items-center gap-2 transition-all shadow-sm ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
        href={makeHref({ page: page - 1 })}
      >
        ← Anterior
      </Link>
      <Link
        aria-disabled={page >= totalPages}
        className={`h-10 rounded-xl border bg-white px-4 text-sm font-medium hover:bg-zinc-50 flex items-center gap-2 transition-all shadow-sm ${page >= totalPages ? "pointer-events-none opacity-40" : ""}`}
        href={makeHref({ page: page + 1 })}
      >
        Próxima →
      </Link>
      <Link
        aria-disabled={page >= totalPages}
        className={`h-10 rounded-xl border bg-white px-4 text-sm font-medium hover:bg-zinc-50 flex items-center gap-2 transition-all shadow-sm ${page >= totalPages ? "pointer-events-none opacity-40" : ""}`}
        href={makeHref({ page: totalPages })}
      >
        Última <span className="hidden sm:inline">»</span>
      </Link>
    </div>
  </div>
    </div >
  );
}