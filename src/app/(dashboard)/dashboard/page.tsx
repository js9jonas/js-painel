export const dynamic = "force-dynamic";

import {
  getDashboardMetrics,
  getPagamentosPorMes,
  getPacotesStats,
  getPlanosStats,
  getVencimentosProximos,
  getReceitaHoje,
  getVendasDiariasDoMes,
  getVendasUltimos30Dias,
} from "@/lib/dashboard";
import MetricCard from "@/components/dashboard/MetricCard";
import ReceitaChart from "@/components/dashboard/ReceitaChart";
import VendasDiariasChart from "@/components/dashboard/VendasDiariasChart";
import VendasUltimos30DiasChart from "@/components/dashboard/VendasUltimos30DiasChart";
import PacotesChart from "@/components/dashboard/PacotesChart";
import PlanosTable from "@/components/dashboard/PlanosTable";
import VencimentosTable from "@/components/dashboard/VencimentosTable";

export default async function DashboardPage() {
  const [
    metrics,
    pagamentosMes,
    pacotes,
    planos,
    vencimentos,
    receitaHoje,
    vendasDiarias,
    vendas30Dias,
  ] = await Promise.all([
    getDashboardMetrics(),
    getPagamentosPorMes(12),
    getPacotesStats(),
    getPlanosStats(),
    getVencimentosProximos(7),
    getReceitaHoje(),
    getVendasDiariasDoMes(),
    getVendasUltimos30Dias(),
  ]);

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

      {/* Métricas principais — agora com 5 cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          title="Clientes Ativos"
          value={metrics.clientesAtivos}
          total={metrics.totalClientes}
          icon="👥"
          color="blue"
          subtitle={`${metrics.clientesInativos} inativos • ${metrics.semAssinatura} sem assinatura`}
        />
        <MetricCard
          title="Recebido Hoje"
          value={`R$ ${receitaHoje.toFixed(2)}`}
          icon="💵"
          color="green"
          subtitle="Pagamentos do dia"
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

      {/* Vendas diárias do mês atual */}
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-zinc-900">
            Vendas Diárias — Mês Atual
          </h3>
          <p className="text-sm text-zinc-600">
            Receita e quantidade de pagamentos por dia
          </p>
        </div>
        <VendasDiariasChart data={vendasDiarias} />
      </div>

      {/* Receita 6 meses */}
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-zinc-900">
            Receita dos Últimos 12 Meses
          </h3>
          <p className="text-sm text-zinc-600">Evolução da receita mês a mês</p>
        </div>
        <ReceitaChart data={pagamentosMes} />
      </div>

      {/* Grid de gráficos menores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Vendas últimos 30 dias — substitui formas de pagamento */}
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-zinc-900">
              Vendas dos Últimos 30 Dias
            </h3>
            <p className="text-sm text-zinc-600">
              Receita diária com ticket médio no tooltip
            </p>
          </div>
          <VendasUltimos30DiasChart data={vendas30Dias} />
        </div>

        {/* Pacotes */}
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
        <div className="rounded-2xl border bg-white overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b bg-zinc-50">
            <h3 className="text-lg font-semibold text-zinc-900">
              Planos Mais Vendidos
            </h3>
            <p className="text-sm text-zinc-600">Assinaturas ativas</p>
          </div>
          <PlanosTable data={planos} />
        </div>

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