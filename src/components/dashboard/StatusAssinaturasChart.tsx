"use client";

// src/components/dashboard/StatusAssinaturasChart.tsx
import type { AssinaturasStatusDist } from "@/lib/dashboard";

type Props = { data: AssinaturasStatusDist[] };

const COR_STATUS: Record<string, string> = {
  ativo:     "#22c55e",
  atrasado:  "#eab308",
  pendente:  "#3b82f6",
  vencido:   "#f97316",
  inativo:   "#a1a1aa",
  cancelado: "#ef4444",
};

const LABEL_STATUS: Record<string, string> = {
  ativo:     "Ativo",
  atrasado:  "Atrasado",
  pendente:  "Pendente",
  vencido:   "Vencido",
  inativo:   "Inativo últimos 6 meses",
  cancelado: "Cancelado",
};

export default function StatusAssinaturasChart({ data }: Props) {
  const total = data.reduce((s, d) => s + d.quantidade, 0);

  if (data.length === 0) {
    return <div className="flex items-center justify-center h-48 text-zinc-400 text-sm">Sem dados</div>;
  }

  return (
    <div className="space-y-2.5">
      {data.map((d) => (
        <div key={d.status}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium text-zinc-700">
              {LABEL_STATUS[d.status] ?? d.status}
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-zinc-900">{d.quantidade}</span>
              <span className="text-xs text-zinc-400 w-10 text-right">{d.percentual}%</span>
            </div>
          </div>
          <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${d.percentual}%`,
                backgroundColor: COR_STATUS[d.status] ?? "#71717a",
              }}
            />
          </div>
        </div>
      ))}
      <div className="pt-2 border-t text-xs text-zinc-400 text-right">
        Total: {total} assinaturas
      </div>
    </div>
  );
}