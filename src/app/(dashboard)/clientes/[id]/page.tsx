// src/app/(dashboard)/clientes/[id]/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import { getAssinaturasByClienteId, getClienteById, getPagamentosByClienteId } from "@/lib/clientes";
import { getPlanos } from "@/lib/planos";
import { getPacotes } from "@/lib/pacotes";
import { getAplicativosByClienteId, getApps } from "@/lib/aplicativos";
import RenovarAssinatura from "@/components/clientes/RenovarAssinatura";
import RowActions from "@/components/clientes/RowActions";
import TabelaPagamentos from "@/components/clientes/TabelaPagamentos";
import EditAssinaturaButton from "@/components/assinaturas/EditAssinaturaButton";
import AplicativosManager from "@/components/aplicativos/AplicativosManager";
import NovaAssinaturaButton from "../../../../components/assinaturas/NovaAssinaturaButton";
import BuscaClienteRapida from "@/components/clientes/BuscaClienteRapida";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function ClienteDetalhePage({ params }: Props) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId).trim();

  const [cliente, assinaturas, todosPagamentos, planos, pacotes, aplicativos, apps] = await Promise.all([
    getClienteById(id),
    getAssinaturasByClienteId(id),
    getPagamentosByClienteId(id, 999),
    getPlanos(),
    getPacotes(),
    getAplicativosByClienteId(id),
    getApps(),
  ]);

  const ativa = [...assinaturas]
    .filter((a) => ["ativo", "pendente"].includes((a.status ?? "").toLowerCase().trim()))
    .sort((a, b) => {
      if (!a.venc_contrato) return 1;
      if (!b.venc_contrato) return -1;
      return a.venc_contrato.localeCompare(b.venc_contrato);
    })[0] ?? null;

  const outras = (ativa ? assinaturas.filter((a) => a.id_assinatura !== ativa.id_assinatura) : assinaturas)
    .sort((a, b) => {
      const statusAtivo = (s: string | null) => (s ?? "").toLowerCase() !== "inativo";
      const aAtivo = statusAtivo(a.status);
      const bAtivo = statusAtivo(b.status);
      if (aAtivo && !bAtivo) return -1;
      if (!aAtivo && bAtivo) return 1;
      if (!a.venc_contrato) return 1;
      if (!b.venc_contrato) return -1;
      return a.venc_contrato.localeCompare(b.venc_contrato);
    });

  return (
    <div className="space-y-4">

      {/* Navegação */}
      <div className="flex items-center justify-between gap-3">
        <Link href="/clientes" className="text-sm text-zinc-600 hover:underline">
          ← Voltar
        </Link>
        <BuscaClienteRapida />
      </div>

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

          <div className="shrink-0 flex items-center gap-2">
            <NovaAssinaturaButton
              idCliente={id}
              planos={planos}
              pacotes={pacotes}
            />
            <RowActions
              idCliente={id}
              nome={cliente?.nome ?? ""}
              telefone={cliente?.telefone ?? null}
              observacao={cliente?.observacao ?? null}
            />
          </div>
        </div>

        <p className="mt-3 text-sm text-zinc-600">
          Assinaturas encontradas:{" "}
          <span className="font-medium text-zinc-900">{assinaturas.length}</span>
        </p>
      </div>

      {/* Assinatura ativa destacada */}
      {ativa && (
        <div className="rounded-2xl border bg-white overflow-hidden">
          <div className={`px-4 py-3 border-b text-sm font-medium ${ativa.status?.toLowerCase() === "pendente"
              ? "bg-red-50 text-red-900"
              : "bg-emerald-50 text-emerald-900"
            }`}>
            {ativa.status?.toLowerCase() === "pendente" ? "⚠️ Assinatura pendente" : "Assinatura ativa"}
          </div>
          <div className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div className="text-sm">
                <div className="text-zinc-500">ID</div>
                <div className="font-medium text-zinc-900">{ativa.id_assinatura}</div>
              </div>
              <div className="text-sm">
                <div className="text-zinc-500">Venc. contrato</div>
                <div className="font-medium text-zinc-900">
                  {ativa.venc_contrato ? ativa.venc_contrato.split("T")[0].split("-").reverse().join("/") : "—"}
                </div>
              </div>
              <div className="text-sm">
                <div className="text-zinc-500">Venc. contas</div>
                <div className="font-medium text-zinc-900">
                  {ativa.venc_contas ? ativa.venc_contas.split("T")[0].split("-").reverse().join("/") : "—"}
                </div>
              </div>
              <div className="text-sm">
                <div className="text-zinc-500">Status</div>
                <div className={`font-medium ${ativa.status?.toLowerCase() === "pendente" ? "text-red-600" : "text-emerald-700"}`}>
                  {ativa.status}
                </div>
              </div>
            </div>

            {(ativa.identificacao || ativa.observacao) && (
              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                {ativa.identificacao && (
                  <div className="text-sm">
                    <div className="text-zinc-500">Identificação</div>
                    <div className="text-zinc-800">{ativa.identificacao}</div>
                  </div>
                )}
                {ativa.observacao && (
                  <div className="text-sm">
                    <div className="text-zinc-500">Observação</div>
                    <div className="text-zinc-800">{ativa.observacao}</div>
                  </div>
                )}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4 p-4 bg-zinc-50 rounded-lg mb-4">
              <div>
                <div className="text-xs font-medium text-zinc-500 uppercase mb-2">Pacote</div>
                {ativa.pacote_contrato ? (
                  <div className="text-sm">
                    <div className="font-semibold text-zinc-900">{ativa.pacote_contrato}</div>
                    {ativa.pacote_telas && (
                      <div className="text-zinc-600 mt-1">
                        {ativa.pacote_telas} tela{ativa.pacote_telas > 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-zinc-400">Não informado</div>
                )}
              </div>
              <div>
                <div className="text-xs font-medium text-zinc-500 uppercase mb-2">Plano</div>
                {ativa.plano_tipo ? (
                  <div className="text-sm">
                    <div className="font-semibold text-zinc-900">{ativa.plano_tipo}</div>
                    <div className="text-zinc-600 mt-1 space-x-2">
                      {ativa.plano_meses && (
                        <span>{ativa.plano_meses} mês{ativa.plano_meses > 1 ? "es" : ""}</span>
                      )}
                      {ativa.plano_valor && (
                        <span>• R$ {parseFloat(ativa.plano_valor).toFixed(2)}</span>
                      )}
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

            <div className="flex justify-end gap-2">
              <EditAssinaturaButton
                idCliente={id}
                assinatura={{
                  id_assinatura: ativa.id_assinatura,
                  id_plano: ativa.id_plano ?? null,
                  id_pacote: ativa.id_pacote ?? null,
                  venc_contrato: ativa.venc_contrato ?? null,
                  venc_contas: ativa.venc_contas ?? null,
                  status: ativa.status ?? "ativo",
                  identificacao: ativa.identificacao ?? null,
                  observacao: ativa.observacao ?? null,
                }}
                planos={planos}
                pacotes={pacotes}
              />
              <RenovarAssinatura
                idAssinatura={ativa.id_assinatura}
                vencAtual={ativa.venc_contrato ?? null}
              />
            </div>
          </div>
        </div>
      )}

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
                <th className="px-4 py-3 text-left font-medium">Venc. contas</th>
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
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${a.status?.toLowerCase() === "ativo"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-zinc-100 text-zinc-600"
                      }`}>
                      {a.status ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-zinc-700">{a.venc_contrato ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-700">{a.venc_contas ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-700">{a.identificacao ?? "—"}</td>
                  <td className="px-4 py-3">
                    {a.pacote_contrato ?? "—"}
                    {a.pacote_telas ? (
                      <span className="text-zinc-500"> • {a.pacote_telas} telas</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {a.plano_tipo ?? "—"}
                    {a.plano_meses ? (
                      <span className="text-zinc-500"> • {a.plano_meses} mês(es)</span>
                    ) : null}
                    {a.plano_valor ? (
                      <span className="text-zinc-500"> • R$ {parseFloat(a.plano_valor).toFixed(2)}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <EditAssinaturaButton
                        idCliente={id}
                        assinatura={{
                          id_assinatura: a.id_assinatura,
                          id_plano: a.id_plano ?? null,
                          id_pacote: a.id_pacote ?? null,
                          venc_contrato: a.venc_contrato ?? null,
                          venc_contas: a.venc_contas ?? null,
                          status: a.status ?? "ativo",
                          identificacao: a.identificacao ?? null,
                          observacao: a.observacao ?? null,
                        }}
                        planos={planos}
                        pacotes={pacotes}
                      />
                      <RenovarAssinatura
                        idAssinatura={a.id_assinatura}
                        vencAtual={a.venc_contrato ?? null}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {outras.length === 0 && (
                <tr>
                  <td className="px-4 py-10 text-center text-zinc-500" colSpan={8}>
                    Nenhuma assinatura encontrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <AplicativosManager
          idCliente={id}
          aplicativos={aplicativos}
          apps={apps}
        />

        <TabelaPagamentos pagamentos={todosPagamentos} />
      </div>
    </div>
  );
}