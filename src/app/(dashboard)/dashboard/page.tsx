// src/app/(dashboard)/dashboard/page.tsx
export const dynamic = "force-dynamic";

import {
  getDashboardMetrics,
  getPagamentosPorMes,
  getPagamentosPorForma,
  getPacotesStats,
  getPlanosStats,
  getVencimentosProximos,
} from "@/lib/dashboard";
import MetricCard from "@/components/dashboard/MetricCard";
import ReceitaChart from "@/components/dashboard/ReceitaChart";
import FormasPagamentoChart from "@/components/dashboard/FormasPagamentoChart";
import PacotesChart from "@/components/dashboard/PacotesChart";
import PlanosTable from "@/components/dashboard/PlanosTable";
import VencimentosTable from "@/components/dashboard/VencimentosTable";

export default async function DashboardPage() {
  const [metrics, pagamentosMes, pagamentosForma, pacotes, planos, vencimentos] =
    await Promise.all([
      getDashboardMetrics(),
      getPagamentosPorMes(6),
      getPagamentosPorForma(),
      getPacotesStats(),
      getPlanosStats(),
      getVencimentosProximos(7),
    ]);

  // Calcular crescimento
  const crescimento =
    metrics.receitaMesAnterior > 0
      ? ((metrics.receitaMesAtual - metrics.receitaMesAnterior) /
          metrics.receitaMesAnterior) *
        100
      : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-zinc-900">Dashboard</h1>
        <p className="text-sm text-zinc-600 mt-1">
          Visão geral do seu negócio em tempo real
        </p>
      </div>

      {/* Métricas principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Clientes Ativos"
          value={metrics.clientesAtivos}
          total={metrics.totalClientes}
          icon="👥"
          color="blue"
          subtitle={`${metrics.clientesInativos} inativos • ${metrics.semAssinatura} sem assinatura`}
        />

        <MetricCard
          title="Receita Mês Atual"
          value={`R$ ${metrics.receitaMesAtual.toFixed(2)}`}
          icon="💰"
          color="green"
          trend={crescimento}
          subtitle={`${crescimento >= 0 ? "+" : ""}${crescimento.toFixed(1)}% vs mês anterior`}
        />

        <MetricCard
          title="Vencem Hoje"
          value={metrics.vencemHoje}
          icon="📅"
          color="yellow"
          subtitle={`${metrics.vencemProximos7Dias} nos próximos 7 dias`}
        />

        <MetricCard
          title="Atrasados"
          value={metrics.atrasados}
          icon="⚠️"
          color="red"
          subtitle="Requer atenção imediata"
        />
      </div>

      {/* Gráfico de Receita */}
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-zinc-900">
            Receita dos Últimos 6 Meses
          </h3>
          <p className="text-sm text-zinc-600">Evolução da receita mês a mês</p>
        </div>
        <ReceitaChart data={pagamentosMes} />
      </div>

      {/* Grid de gráficos menores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Formas de pagamento */}
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-zinc-900">
              Formas de Pagamento
            </h3>
            <p className="text-sm text-zinc-600">Últimos 30 dias</p>
          </div>
          <FormasPagamentoChart data={pagamentosForma} />
        </div>

        {/* Distribuição de pacotes */}
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-zinc-900">
              Pacotes Ativos
            </h3>
            <p className="text-sm text-zinc-600">Distribuição atual</p>
          </div>
          <PacotesChart data={pacotes} />
        </div>
      </div>

      {/* Tabelas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Planos mais vendidos */}
        <div className="rounded-2xl border bg-white overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b bg-zinc-50">
            <h3 className="text-lg font-semibold text-zinc-900">
              Planos Mais Vendidos
            </h3>
            <p className="text-sm text-zinc-600">Assinaturas ativas</p>
          </div>
          <PlanosTable data={planos} />
        </div>

        {/* Vencimentos próximos */}
        <div className="rounded-2xl border bg-white overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b bg-zinc-50">
            <h3 className="text-lg font-semibold text-zinc-900">
              Próximos Vencimentos
            </h3>
            <p className="text-sm text-zinc-600">Próximos 7 dias</p>
          </div>
          <VencimentosTable data={vencimentos} />
        </div>
      </div>
    </div>
  );
}