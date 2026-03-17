"use client";

// src/components/dashboard/ClientesNovosChart.tsx
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";
import type { ClientesNovosMes, NaoRenovadosMes } from "@/lib/dashboard";

type Props = {
  novos: ClientesNovosMes[];
  naoRenovados: NaoRenovadosMes[];
};

export default function ClientesNovosChart({ novos, naoRenovados }: Props) {
  // Monta mapa combinado por "Mon/YYYY"
  const mesesMap = new Map<string, { mes: string; novos: number; naoRenovados: number }>();

  novos.forEach((n) => {
    const key = `${n.mes}/${n.ano}`;
    mesesMap.set(key, { mes: n.mes, novos: n.quantidade, naoRenovados: 0 });
  });

  naoRenovados.forEach((n) => {
    const key = `${n.mes}/${n.ano}`;
    const existing = mesesMap.get(key);
    if (existing) existing.naoRenovados = n.quantidade;
    else mesesMap.set(key, { mes: n.mes, novos: 0, naoRenovados: n.quantidade });
  });

  const data = Array.from(mesesMap.values());

  if (data.length === 0) {
    return <div className="flex items-center justify-center h-48 text-zinc-400 text-sm">Sem dados no período</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} barCategoryGap="30%" barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="mes" tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7", fontSize: 12 }}
          formatter={(v, name) => [v ?? 0, name === "novos" ? "Novos clientes" : "Não renovados"]}
        />
        <Legend
          formatter={(v) => v === "novos" ? "Novos clientes" : "Não renovados"}
          wrapperStyle={{ fontSize: 12 }}
        />
        <Bar dataKey="novos" fill="#22c55e" radius={[4, 4, 0, 0]} name="novos" />
        <Bar dataKey="naoRenovados" fill="#f87171" radius={[4, 4, 0, 0]} name="naoRenovados" />
      </BarChart>
    </ResponsiveContainer>
  );
}