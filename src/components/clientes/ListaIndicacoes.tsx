// src/components/clientes/ListaIndicacoes.tsx
import Link from "next/link";
import { getIndicacoesByParceiroId, type IndicacaoRow } from "@/lib/indicacoes";
import NovaIndicacaoModal from "@/components/clientes/NovaIndicacaoModal";
import EditIndicacaoButton from "@/components/clientes/EditIndicacaoButton";

const STATUS_STYLE: Record<string, string> = {
  ativo:    "bg-emerald-50 text-emerald-700",
  pendente: "bg-red-50 text-red-600",
  inativo:  "bg-zinc-100 text-zinc-500",
};

export default async function ListaIndicacoes({ idParceiro }: { idParceiro: string }) {
  console.log(">>> ListaIndicacoes chamado para:", idParceiro);
  let indicacoes: IndicacaoRow[] = [];

  try {
    indicacoes = await getIndicacoesByParceiroId(idParceiro);
    console.log(">>> indicacoes encontradas:", indicacoes.length);
  } catch (err) {
    console.error("ERRO ListaIndicacoes:", err);
    return (
      <div className="rounded-2xl border bg-white p-4 text-sm text-red-500">
        Erro ao carregar indicacoes: {String(err)}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-white overflow-hidden">
      <div className="px-4 py-3 border-b bg-zinc-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-700">Indicacoes</span>
          {indicacoes.length > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-zinc-200 text-xs font-semibold text-zinc-600">
              {indicacoes.length}
            </span>
          )}
        </div>
        <NovaIndicacaoModal idParceiro={idParceiro} />
      </div>

      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="text-zinc-500 bg-zinc-50 border-b">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">Cliente</th>
              <th className="px-4 py-2.5 text-left font-medium">Plano</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5 text-left font-medium">Bonificacao</th>
              <th className="px-4 py-2.5 text-left font-medium">Acoes</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {indicacoes.map((ind) => {
              const statusKey = (ind.status_assinatura ?? "inativo").toLowerCase().trim();
              return (
                <tr key={ind.id_indicacao} className="hover:bg-zinc-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-900">
                      {ind.nome_indicado ?? ind.id_indicado}
                    </div>
                    {ind.telefone_indicado && (
                      <div className="text-xs text-zinc-400 mt-0.5">{ind.telefone_indicado}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-700">
                    {ind.plano_tipo ?? <span className="text-zinc-400">sem plano</span>}
                  </td>
                  <td className="px-4 py-3">
                    {ind.status_assinatura ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium capitalize ${STATUS_STYLE[statusKey] ?? "bg-zinc-100 text-zinc-500"}`}>
                        {ind.status_assinatura}
                      </span>
                    ) : (
                      <span className="text-zinc-400 text-xs">Sem assinatura</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <EditIndicacaoButton
                      id_indicacao={ind.id_indicacao}
                      bonificacao={ind.bonificacao}
                      idParceiro={idParceiro}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/clientes/${ind.id_indicado}`}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-600 border border-zinc-200 hover:bg-zinc-50 transition-colors"
                    >
                      Ver
                    </Link>
                  </td>
                </tr>
              );
            })}
            {indicacoes.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-zinc-400 text-sm">
                  Nenhuma indicacao registrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
