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

type Props = {
  data: Array<{
    mes: string;
    ano: number;
    total: number;
    quantidade: number;
  }>;
};

export default function ReceitaChart({ data }: Props) {
  const chartData = data.map((item) => ({
    name: `${item.mes}/${String(item.ano).slice(-2)}`,
    receita: item.total,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="name" stroke="#71717a" fontSize={12} />
        <YAxis stroke="#71717a" fontSize={12} />
        <Tooltip />
        <Area
          type="monotone"
          dataKey="receita"
          stroke="#3b82f6"
          strokeWidth={2}
          fill="url(#colorReceita)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}