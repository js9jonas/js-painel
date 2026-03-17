"use client";

// src/components/dashboard/ClientesNovosChart.tsx
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from "recharts";
import type { ClientesNovosMes, NaoRenovadosMes } from "@/lib/dashboard";

type Props = {
  novos: ClientesNovosMes[];
  naoRenovados: NaoRenovadosMes[];
};

const MESES_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export default function ClientesNovosChart({ novos, naoRenovados }: Props) {
  // Gera os últimos 6 meses como chave YYYY-MM
  const hoje = new Date();
  const meses6 = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - 5 + i, 1);
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: `${MESES_PT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
      novos: 0,
      naoRenovados: 0,
    };
  });

  // Preenche novos — ano+mes vem do banco
  novos.forEach((n) => {
    const key = `${n.ano}-${String(n.mes_num ?? 0).padStart(2, "0")}`;
    const slot = meses6.find((m) => m.key === key);
    if (slot) slot.novos = n.quantidade;
  });

  naoRenovados.forEach((n) => {
    const key = `${n.ano}-${String(n.mes_num ?? 0).padStart(2, "0")}`;
    const slot = meses6.find((m) => m.key === key);
    if (slot) slot.naoRenovados = n.quantidade;
  });

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={meses6}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 12, fill: "#71717a" }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #e4e4e7", fontSize: 12 }}
          formatter={(v, name) => [v ?? 0, name === "novos" ? "Novos clientes" : "Não renovados"]}
        />
        <Legend
          formatter={(v) => v === "novos" ? "Novos clientes" : "Não renovados"}
          wrapperStyle={{ fontSize: 12 }}
        />
        <Line dataKey="novos" stroke="#22c55e" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} name="novos" />
        <Line dataKey="naoRenovados" stroke="#f87171" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} name="naoRenovados" />
      </LineChart>
    </ResponsiveContainer>
  );
}