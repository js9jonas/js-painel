// src/app/(dashboard)/clientes/[id]/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import { getAssinaturasByClienteId, getClienteById, getPagamentosByClienteId } from "@/lib/clientes";
import RenovarAssinatura from "@/components/clientes/RenovarAssinatura";
import RowActions from "@/components/clientes/RowActions";
import TabelaPagamentos from "@/components/clientes/TabelaPagamentos";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ClienteDetalhePage({ params }: Props) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId).trim();

  const [cliente, assinaturas, todosPagamentos] = await Promise.all([
    getClienteById(id),
    getAssinaturasByClienteId(id),
    getPagamentosByClienteId(id, 999), // Buscar TODOS os pagamentos (limite alto)
  ]);

  const ativa = assinaturas.find((a) => (a.status ?? "").toLowerCase().trim() === "ativo") ?? null;
  const outras = ativa ? assinaturas.filter((a) => a.id_assinatura !== ativa.id_assinatura) : assinaturas;

  return (
    <div className="space-y-4">
      <Link href="/clientes" className="text-sm text-zinc-600 hover:underline">
        ← Voltar
      </Link>

      {/* Cabeçalho do cliente */}
      <div className="rounded-2xl border bg-white p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">
              {cliente?.nome ?? `Cliente #${id}`}
            </h1>

            <div className="mt-2 grid gap-1 text-sm text-zinc-600">
              <div>
                <span className="text-zinc-500">ID:</span>{" "}
                <span className="font-medium text-zinc-800">{id}</span>
              </div>

              <div>
                <span className="text-zinc-500">Telefone:</span>{" "}
                {cliente?.telefone ? (
                  <span className="font-medium text-zinc-800">{cliente.telefone}</span>
                ) : (
                  <span className="text-zinc-400">—</span>
                )}
              </div>

              <div>
                <span className="text-zinc-500">Observação:</span>{" "}
                {cliente?.observacao ? (
                  <span className="text-zinc-800">{cliente.observacao}</span>
                ) : (
                  <span className="text-zinc-400">—</span>
                )}
              </div>
            </div>
          </div>

          {/* Ações rápidas do cliente */}
          <div className="shrink-0">
            <RowActions
              idCliente={id}
              telefone={cliente?.telefone ?? null}
              observacao={cliente?.observacao ?? null}
            />
          </div>
        </div>

        <p className="mt-3 text-sm text-zinc-600">
          Assinaturas encontradas: <span className="font-medium text-zinc-900">{assinaturas.length}</span>
        </p>
      </div>

      {/* Assinatura ativa destacada */}
      {ativa && (
        <div className="rounded-2xl border bg-white overflow-hidden">
          <div className="px-4 py-3 border-b bg-emerald-50 text-sm font-medium text-emerald-900">
            Assinatura ativa
          </div>

          <div className="p-4">
            {/* Informações principais */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div className="text-sm">
                <div className="text-zinc-500">ID</div>
                <div className="font-medium text-zinc-900">{ativa.id_assinatura}</div>
              </div>

              <div className="text-sm">
                <div className="text-zinc-500">Venc. contrato</div>
                <div className="font-medium text-zinc-900">{ativa.venc_contrato ?? "—"}</div>
              </div>

              <div className="text-sm">
                <div className="text-zinc-500">Identificação</div>
                <div className="font-medium text-zinc-900">{ativa.identificacao ?? "—"}</div>
              </div>

              <div className="text-sm">
                <div className="text-zinc-500">Status</div>
                <div className="font-medium text-emerald-700">{ativa.status}</div>
              </div>
            </div>

            {/* Informações de Pacote e Plano */}
            <div className="grid sm:grid-cols-2 gap-4 p-4 bg-zinc-50 rounded-lg mb-4">
              {/* Pacote */}
              <div>
                <div className="text-xs font-medium text-zinc-500 uppercase mb-2">Pacote</div>
                {ativa.pacote_contrato ? (
                  <div className="text-sm">
                    <div className="font-semibold text-zinc-900">{ativa.pacote_contrato}</div>
                    {ativa.pacote_telas && (
                      <div className="text-zinc-600 mt-1">{ativa.pacote_telas} tela{ativa.pacote_telas > 1 ? 's' : ''}</div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-zinc-400">Não informado</div>
                )}
              </div>

              {/* Plano */}
              <div>
                <div className="text-xs font-medium text-zinc-500 uppercase mb-2">Plano</div>
                {ativa.plano_tipo ? (
                  <div className="text-sm">
                    <div className="font-semibold text-zinc-900">{ativa.plano_tipo}</div>
                    <div className="text-zinc-600 mt-1 space-x-2">
                      {ativa.plano_meses && <span>{ativa.plano_meses} mês{ativa.plano_meses > 1 ? 'es' : ''}</span>}
                      {ativa.plano_valor && <span>• R$ {parseFloat(ativa.plano_valor).toFixed(2)}</span>}
                    </div>
                    {ativa.plano_descricao && (
                      <div className="text-xs text-zinc-500 mt-1">{ativa.plano_descricao}</div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-zinc-400">Não informado</div>
                )}
              </div>
            </div>

            {/* Botão de renovar */}
            <div className="flex justify-end">
              <RenovarAssinatura
                idAssinatura={ativa.id_assinatura}
                vencAtual={ativa.venc_contrato ?? null}
              />
            </div>
          </div>
        </div>
      )}

      {/* COMPONENTE COM TODOS OS PAGAMENTOS */}
      <TabelaPagamentos pagamentos={todosPagamentos} />

      {/* Tabela completa de assinaturas */}
      <div className="rounded-2xl border bg-white overflow-hidden">
        <div className="px-4 py-3 border-b bg-zinc-50 text-sm font-medium text-zinc-700">
          Todas as assinaturas
        </div>

        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-zinc-600 bg-zinc-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">ID</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Venc. contrato</th>
                <th className="px-4 py-3 text-left font-medium">Identificação</th>
                <th className="px-4 py-3 text-left font-medium">Pacote</th>
                <th className="px-4 py-3 text-left font-medium">Plano</th>
                <th className="px-4 py-3 text-left font-medium">Ações</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {outras.map((a) => (
                <tr key={a.id_assinatura} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 font-medium text-zinc-900">{a.id_assinatura}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                      a.status?.toLowerCase() === 'ativo' 
                        ? 'bg-emerald-50 text-emerald-700' 
                        : 'bg-zinc-100 text-zinc-600'
                    }`}>
                      {a.status ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-700">{a.venc_contrato ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-700">{a.identificacao ?? "—"}</td>
                  <td className="px-4 py-3">
                    {a.pacote_contrato ?? "—"}
                    {a.pacote_telas ? <span className="text-zinc-500"> • {a.pacote_telas} telas</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    {a.plano_tipo ?? "—"}
                    {a.plano_meses ? <span className="text-zinc-500"> • {a.plano_meses} mês(es)</span> : null}
                    {a.plano_valor ? <span className="text-zinc-500"> • R$ {parseFloat(a.plano_valor).toFixed(2)}</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    <RenovarAssinatura
                      idAssinatura={a.id_assinatura}
                      vencAtual={a.venc_contrato ?? null}
                    />
                  </td>
                </tr>
              ))}

              {outras.length === 0 && (
                <tr>
                  <td className="px-4 py-10 text-center text-zinc-500" colSpan={7}>
                    Nenhuma assinatura encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}