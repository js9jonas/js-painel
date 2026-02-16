import Link from "next/link";

type Props = {
  data: Array<{
    id_cliente: string;
    nome: string;
    venc_contrato: string;
    dias_restantes: number;
    pacote: string;
  }>;
};

export default function VencimentosTable({ data }: Props) {
  return (
    <div className="overflow-auto max-h-[400px]">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 text-zinc-600 bg-zinc-50 border-b">
          <tr>
            <th className="px-6 py-3 text-left font-medium text-xs uppercase tracking-wider">
              Cliente
            </th>
            <th className="px-6 py-3 text-left font-medium text-xs uppercase tracking-wider">
              Pacote
            </th>
            <th className="px-6 py-3 text-left font-medium text-xs uppercase tracking-wider">
              Vencimento
            </th>
            <th className="px-6 py-3 text-center font-medium text-xs uppercase tracking-wider">
              Dias
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-zinc-100">
          {data.map((item) => {
            let badgeColor = "bg-emerald-50 text-emerald-700";
            if (item.dias_restantes === 0) {
              badgeColor = "bg-amber-50 text-amber-700";
            } else if (item.dias_restantes < 0) {
              badgeColor = "bg-red-50 text-red-700";
            }

            return (
              <tr key={item.id_cliente} className="hover:bg-zinc-50/50 transition-colors">
                <td className="px-6 py-4">
                  <Link
                    href={`/clientes/${item.id_cliente}`}
                    className="font-medium text-zinc-900 hover:text-blue-600 hover:underline"
                  >
                    {item.nome}
                  </Link>
                </td>
                <td className="px-6 py-4 text-zinc-700">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700">
                    {item.pacote}
                  </span>
                </td>
                <td className="px-6 py-4 text-zinc-700">
                  {new Date(item.venc_contrato).toLocaleDateString("pt-BR")}
                </td>
                <td className="px-6 py-4 text-center">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${badgeColor}`}>
                    {item.dias_restantes === 0
                      ? "Hoje"
                      : item.dias_restantes < 0
                      ? `${Math.abs(item.dias_restantes)}d atrás`
                      : `${item.dias_restantes}d`}
                  </span>
                </td>
              </tr>
            );
          })}

          {data.length === 0 && (
            <tr>
              <td colSpan={4} className="px-6 py-10 text-center text-zinc-500">
                <div className="flex flex-col items-center gap-2">
                  <div className="text-4xl">✅</div>
                  <div className="font-medium">Nenhum vencimento próximo</div>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}