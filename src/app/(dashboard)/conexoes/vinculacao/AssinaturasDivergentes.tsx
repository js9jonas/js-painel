import Link from "next/link";

export type AssinaturaDivergente = {
  id_assinatura: number;
  id_cliente: number;
  cliente: string;
  pacote: string | null;
  plano: string | null;
  telas_esperadas: number;
  contas_ativas: number;
  diferenca: number;
  venc_contrato: string | null;
};

function formatDate(d: string | null) {
  if (!d) return "—";
  return d.slice(0, 10).split("-").reverse().join("/");
}

export default function AssinaturasDivergentes({ rows }: { rows: AssinaturaDivergente[] }) {
  if (rows.length === 0) return null;

  const semConta = rows.filter((r) => r.contas_ativas === 0);
  const incompletas = rows.filter((r) => r.contas_ativas > 0);

  return (
    <div className="rounded-xl border border-amber-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-amber-100 bg-amber-50 flex items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-amber-900 text-base">
            Assinaturas ativas com contas insuficientes
          </h2>
          <p className="text-xs text-amber-700 mt-0.5">
            {semConta.length > 0 && `${semConta.length} sem nenhuma conta`}
            {semConta.length > 0 && incompletas.length > 0 && " · "}
            {incompletas.length > 0 && `${incompletas.length} com telas incompletas`}
          </p>
        </div>
        <span className="rounded-full bg-amber-600 text-white text-xs font-bold px-2.5 py-1">
          {rows.length}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-xs text-zinc-500 uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left font-medium">Cliente</th>
              <th className="px-4 py-2.5 text-left font-medium">Pacote / Plano</th>
              <th className="px-4 py-2.5 text-center font-medium">Telas</th>
              <th className="px-4 py-2.5 text-center font-medium">Contas</th>
              <th className="px-4 py-2.5 text-center font-medium">Faltam</th>
              <th className="px-4 py-2.5 text-left font-medium">Venc. Contrato</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {rows.map((r) => {
              const semNenhuma = r.contas_ativas === 0;
              return (
                <tr key={r.id_assinatura} className={`transition-colors hover:bg-zinc-50 ${semNenhuma ? "bg-red-50/40" : ""}`}>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/clientes/${r.id_cliente}`}
                      className="font-medium text-zinc-900 hover:text-blue-600 transition-colors"
                    >
                      {r.cliente}
                    </Link>
                    <span className="ml-2 text-xs text-zinc-400">#{r.id_assinatura}</span>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-600">
                    {r.pacote ?? "—"}
                    {r.plano && (
                      <span className="ml-1 text-xs text-zinc-400">· {r.plano}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center text-zinc-700 font-medium">
                    {r.telas_esperadas}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`font-semibold ${semNenhuma ? "text-red-600" : "text-amber-600"}`}>
                      {r.contas_ativas}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-flex items-center justify-center rounded-full w-6 h-6 text-xs font-bold ${
                      semNenhuma
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {r.diferenca}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500 text-xs">
                    {formatDate(r.venc_contrato)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
