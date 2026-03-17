"use client";

// src/components/dashboard/ServidoresUsoTable.tsx
import type { ServidorUso } from "@/lib/dashboard";

type Props = { data: ServidorUso[] };

function formatPrevisao(dataStr: string | null): string {
  if (!dataStr) return "+24 meses";
  const [y, m, d] = dataStr.split("-");
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dias = Math.round((new Date(dataStr + "T00:00:00").getTime() - hoje.getTime()) / 86400000);
  if (dias <= 0) return "Esgotado";
  return `${d}/${m}/${y} (${dias}d)`;
}

function badgePrevisao(dataStr: string | null): string {
  if (!dataStr) return "bg-emerald-100 text-emerald-700";
  const dias = Math.round((new Date(dataStr + "T00:00:00").getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
  if (dias <= 0)  return "bg-red-600 text-white";
  if (dias <= 7)  return "bg-red-100 text-red-700";
  if (dias <= 15) return "bg-orange-100 text-orange-700";
  return "bg-yellow-100 text-yellow-700";
}

function saldoBadge(saldo: number, consumo: number) {
  const meses = consumo > 0 ? saldo / consumo : 99;
  if (meses <= 0) return "bg-red-100 text-red-700";
  if (meses <= 1) return "bg-orange-100 text-orange-700";
  if (meses <= 2) return "bg-yellow-100 text-yellow-700";
  return "bg-emerald-100 text-emerald-700";
}

export default function ServidoresUsoTable({ data }: Props) {
  if (data.length === 0) {
    return <div className="px-6 py-10 text-center text-zinc-400 text-sm">Nenhum servidor com assinaturas ativas</div>;
  }

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-zinc-50 border-b">
          <tr>
            {["Servidor", "Assinaturas", "Créditos/mês", "Saldo", "Estimativa"].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 uppercase tracking-wider">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {data.map((s) => (
            <tr key={s.id_servidor} className="hover:bg-zinc-50/50 transition-colors">
              <td className="px-4 py-3">
                <div className="font-medium text-zinc-900">{s.codigo_publico}</div>
                <div className="text-xs text-zinc-400">{s.nome_interno}</div>
              </td>
              <td className="px-4 py-3 font-semibold text-zinc-800">{s.qtd_assinaturas}</td>
              <td className="px-4 py-3 font-semibold text-zinc-800">{s.creditos_mensal}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${saldoBadge(s.saldo_atual, s.creditos_mensal)}`}>
                  {s.saldo_atual}
                </span>
              </td>
              <td className="px-4 py-3">
                {s.data_esgotamento ? (
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${badgePrevisao(s.data_esgotamento)}`}>
                    {formatPrevisao(s.data_esgotamento)}
                  </span>
                ) : (
                  <span className="text-xs text-emerald-600 font-medium">+24 meses</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}