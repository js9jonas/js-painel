"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

type Props = {
  data: Array<Record<string, string | number>>;
  labelKey?: string;
};

export default function PacotesChart({ data, labelKey = "pacote" }: Props) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis type="number" stroke="#71717a" fontSize={12} />
        <YAxis dataKey={labelKey} type="category" stroke="#71717a" fontSize={12} width={120} />
        <Tooltip />
        <Bar dataKey="quantidade" radius={[0, 8, 8, 0]}>
          {data.map((_entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
