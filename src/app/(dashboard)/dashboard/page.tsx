// src/app/(dashboard)/page.tsx
export const dynamic = "force-dynamic";

import {
  getMetricasQuantitativas,
  getClientesNovosPorMes,
  getNaoRenovadosPorMes,
  getServidoresUsoComPrevisao,
  getStatusAssinaturas,
  getContasAtivasPorServidor,
  getVencimentosProximos,
} from "@/lib/dashboard";
import ClientesNovosChart from "@/components/dashboard/ClientesNovosChart";
import ServidoresUsoTable from "@/components/dashboard/ServidoresUsoTable";
import StatusAssinaturasChart from "@/components/dashboard/StatusAssinaturasChart";
import PacotesChart from "@/components/dashboard/PacotesChart";
import VencimentosTable from "@/components/dashboard/VencimentosTable";
import Link from "next/link";

function StatCard({
  title, value, subtitle, icon, cor, href,
}: {
  title: string;
  value: number;
  subtitle?: string;
  icon: string;
  cor: "green" | "blue" | "yellow" | "red" | "purple" | "zinc";
  href?: string;
}) {
  const cores = {
    green: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", val: "text-emerald-800" },
    blue: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", val: "text-blue-800" },
    yellow: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200", val: "text-yellow-800" },
    red: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", val: "text-red-800" },
    purple: { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", val: "text-purple-800" },
    zinc: { bg: "bg-zinc-50", text: "text-zinc-700", border: "border-zinc-200", val: "text-zinc-800" },
  };
  const c = cores[cor];

  const inner = (
    <div className={`rounded-2xl border ${c.border} ${c.bg} p-5 flex flex-col gap-3 h-full ${href ? "hover:shadow-md transition-shadow cursor-pointer" : ""}`}>
      <div className="flex items-start justify-between">
        <span className="text-2xl">{icon}</span>
        <span className={`text-3xl font-bold ${c.val}`}>{value}</span>
      </div>
      <div>
        <p className={`text-sm font-semibold ${c.text}`}>{title}</p>
        {subtitle && <p className="text-xs text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );

  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

export default async function DashboardPage() {
  const [
    metricas,
    clientesNovos,
    naoRenovados,
    servidores,
    statusAssinaturas,
    contasPorServidor,
    vencimentos,
  ] = await Promise.all([
    getMetricasQuantitativas(),
    getClientesNovosPorMes(),
    getNaoRenovadosPorMes(),
    getServidoresUsoComPrevisao(),
    getStatusAssinaturas(),
    getContasAtivasPorServidor(),
    getVencimentosProximos(7),
  ]);

  const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-1 capitalize">{hoje}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/clientes?status=pendente"
            className="h-9 rounded-xl border border-blue-200 bg-blue-50 px-4 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors flex items-center gap-1.5">
            🔵 {metricas.pendentes + metricas.appsPendentes} pendentes
          </Link>
          <Link href="/alertas"
            className="h-9 rounded-xl border border-amber-200 bg-amber-50 px-4 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors flex items-center gap-1.5">
            🚨 Alertas
          </Link>
        </div>
      </div>

      {/* Cards principais */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          title="Clientes ativos"
          value={metricas.clientesAtivos}
          subtitle="Com assinatura ativa"
          icon="👥" cor="blue"
          href="/clientes?status=ativo"
        />
        <StatCard
          title="Novos este mês"
          value={metricas.novosMes}
          subtitle="Clientes cadastrados"
          icon="✨" cor="green"
          href="/clientes"
        />
        <StatCard
          title="Renovadas hoje"
          value={metricas.renovadasHoje}
          subtitle="Atualizadas hoje"
          icon="🔄" cor="purple"
          href="/pagamentos"
        />
        <StatCard
          title="Pendentes"
          value={metricas.pendentes}
          subtitle={`${metricas.appsPendentes} apps pendentes`}
          icon="⏳" cor="yellow"
          href="/clientes?status=pendente"
        />
        <StatCard
          title="Vencendo em 7d"
          value={metricas.vencendo7dias}
          subtitle="Venc. conta próximo"
          icon="📅" cor="yellow"
          href="/alertas"
        />
        <StatCard
          title="Não renovados"
          value={metricas.naoRenovadosMes}
          subtitle="Vencidos este mês"
          icon="❌" cor="red"
          href="/clientes?status=vencido"
        />
      </div>

      {/* Gráfico: Novos vs Não renovados */}
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-5">
          <h3 className="text-base font-semibold text-zinc-900">Clientes novos × Não renovados</h3>
          <p className="text-sm text-zinc-500 mt-0.5">Comparativo mensal dos últimos 6 meses</p>
        </div>
        <ClientesNovosChart novos={clientesNovos} naoRenovados={naoRenovados} />
      </div>

      {/* Grid: Status + Pacotes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h3 className="text-base font-semibold text-zinc-900">Status das assinaturas</h3>
            <p className="text-sm text-zinc-500 mt-0.5">Distribuição atual por status</p>
          </div>
          <StatusAssinaturasChart data={statusAssinaturas} />
        </div>

        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-5">
            <h3 className="text-base font-semibold text-zinc-900">Contas ativas por servidor</h3>
            <p className="text-sm text-zinc-500 mt-0.5">Distribuição de assinaturas ativas por servidor</p>
          </div>
          <PacotesChart data={contasPorServidor} labelKey="servidor" />
        </div>
      </div>

      {/* Servidores */}
      <div className="rounded-2xl border bg-white overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b bg-zinc-50 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-zinc-900">🖥️ Uso por servidor</h3>
            <p className="text-sm text-zinc-500 mt-0.5">Baseado em assinaturas ativas — realidade de consumo</p>
          </div>
          <Link href="/alertas" className="text-xs text-indigo-600 hover:underline">Ver saldos →</Link>
        </div>
        <ServidoresUsoTable data={servidores} />
      </div>

      {/* Vencimentos */}
      <div className="rounded-2xl border bg-white overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b bg-zinc-50">
          <h3 className="text-base font-semibold text-zinc-900">📅 Próximos vencimentos</h3>
          <p className="text-sm text-zinc-500 mt-0.5">Contratos vencendo nos próximos 7 dias</p>
        </div>
        <VencimentosTable data={vencimentos} />
      </div>
    </div>
  );
}