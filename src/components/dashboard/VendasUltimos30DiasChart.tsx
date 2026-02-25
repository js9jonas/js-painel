"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { VendaUltimos30Dias } from "@/lib/dashboard";

interface Props {
  data: VendaUltimos30Dias[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const d = payload[0]?.payload as VendaUltimos30Dias;
    return (
      <div className="bg-white border border-zinc-200 rounded-xl p-3 shadow-lg text-sm">
        <p className="font-semibold text-zinc-700 mb-1">{label}</p>
        <p className="text-emerald-600">Receita: R$ {d.total.toFixed(2)}</p>
        <p className="text-zinc-500">Pagamentos: {d.quantidade}</p>
        <p className="text-zinc-500">Ticket médio: R$ {d.ticketMedio.toFixed(2)}</p>
      </div>
    );
  }
  return null;
};

export default function VendasUltimos30DiasChart({ data }: Props) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-400 text-sm">
        Sem dados dos últimos 30 dias
      </div>
    );
  }

  // Mostrar só algumas labels no eixo X para não poluir
  const ticksVisiveis = data
    .filter((_, i) => i % 5 === 0 || i === data.length - 1)
    .map((d) => d.data);

  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="colorVendas" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" />
        <XAxis
          dataKey="data"
          tick={{ fontSize: 11, fill: "#71717a" }}
          tickLine={false}
          axisLine={false}
          ticks={ticksVisiveis}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#71717a" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="total"
          stroke="#10b981"
          strokeWidth={2}
          fill="url(#colorVendas)"
          dot={false}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}