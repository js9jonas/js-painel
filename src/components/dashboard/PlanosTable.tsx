type Props = {
  data: Array<{
    plano: string;
    quantidade: number;
    receita: number;
  }>;
};

export default function PlanosTable({ data }: Props) {
  const total = data.reduce((acc, item) => acc + item.quantidade, 0);

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="text-zinc-600 bg-zinc-50">
          <tr>
            <th className="px-6 py-3 text-left font-medium text-xs uppercase tracking-wider">
              Plano
            </th>
            <th className="px-6 py-3 text-right font-medium text-xs uppercase tracking-wider">
              Quantidade
            </th>
            <th className="px-6 py-3 text-right font-medium text-xs uppercase tracking-wider">
              Receita Potencial
            </th>
            <th className="px-6 py-3 text-right font-medium text-xs uppercase tracking-wider">
              %
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-zinc-100">
          {data.map((plano, index) => {
            const percentual = total > 0 ? (plano.quantidade / total) * 100 : 0;

            return (
              <tr key={index} className="hover:bg-zinc-50/50 transition-colors">
                <td className="px-6 py-4 font-medium text-zinc-900">
                  {plano.plano}
                </td>
                <td className="px-6 py-4 text-right text-zinc-700">
                  {plano.quantidade}
                </td>
                <td className="px-6 py-4 text-right font-semibold text-zinc-900">
                  R$ {plano.receita.toFixed(2)}
                </td>
                <td className="px-6 py-4 text-right">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 text-blue-700">
                    {percentual.toFixed(1)}%
                  </span>
                </td>
              </tr>
            );
          })}

          {data.length === 0 && (
            <tr>
              <td colSpan={4} className="px-6 py-10 text-center text-zinc-500">
                Nenhum dado disponível
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}