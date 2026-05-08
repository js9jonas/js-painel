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
import ListaIndicacoes from "@/components/clientes/ListaIndicacoes";
import { tempoDesde } from "@/lib/tempo";
import { getIndicacoesStatsByParceiroId } from "@/lib/indicacoes";
import IndicadorInfo from "@/components/clientes/IndicadorInfo";
import { getParceiroByIndicadoId } from "@/lib/indicacoes";
import ScoreFidelidade from "@/components/clientes/ScoreFidelidade";

type Props = {
  params: Promise<{ id: string }>;
};

// ─── helpers de status ────────────────────────────────────────────────────────

/** Status que merecem destaque no card principal */
const STATUS_DESTAQUE = ["ativo", "atrasado", "vencido", "pendente"];

/** Rótulo legível do card de destaque */
function labelDestaque(status: string | null): string {
  switch ((status ?? "").toLowerCase().trim()) {
    case "pendente": return "Assinatura pendente";
    case "atrasado": return "Assinatura atrasada";
    case "vencido": return "Assinatura vencida";
    default: return "Assinatura ativa";
  }
}

/** Classes de cor do cabeçalho do card de destaque */
function headerDestaque(status: string | null): string {
  switch ((status ?? "").toLowerCase().trim()) {
    case "pendente": return "bg-red-50 text-red-900";
    case "atrasado": return "bg-yellow-50 text-yellow-900";
    case "vencido": return "bg-zinc-100 text-zinc-600";
    default: return "bg-emerald-50 text-emerald-900";
  }
}

/** Classes de cor do valor de status dentro do card */
function corStatusDestaque(status: string | null): string {
  switch ((status ?? "").toLowerCase().trim()) {
    case "pendente": return "text-red-600";
    case "atrasado": return "text-yellow-700";
    case "vencido": return "text-zinc-500";
    default: return "text-emerald-700";
  }
}

/** Dias desde o último pagamento da lista (já ordenada por data DESC) */
function diasDesdeUltimoPagamento(pagamentos: { data_pgto: string | null }[]): number | null {
  const ultimo = pagamentos.find(p => p.data_pgto);
  if (!ultimo?.data_pgto) return null;
  const diff = Date.now() - new Date(ultimo.data_pgto).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/** Badge colorido por status na tabela de assinaturas */
function badgeStatus(status: string | null): string {
  switch ((status ?? "").toLowerCase().trim()) {
    case "ativo":    return "bg-emerald-100 text-emerald-700";
    case "atrasado": return "bg-yellow-100 text-yellow-700";
    case "pendente": return "bg-red-100 text-red-700";
    case "vencido":  return "bg-zinc-100 text-zinc-500";
    default:         return "bg-zinc-100 text-zinc-500";
  }
}

/** Fundo da linha na tabela de assinaturas */
function bgLinhaStatus(status: string | null): string {
  switch ((status ?? "").toLowerCase().trim()) {
    case "ativo":    return "bg-emerald-50/50 hover:bg-emerald-50";
    case "atrasado": return "bg-yellow-50/50 hover:bg-yellow-50";
    case "pendente": return "bg-red-50/50 hover:bg-red-50";
    default:         return "hover:bg-zinc-50";
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export default async function ClienteDetalhePage({ params }: Props) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId).trim();

  const [cliente, assinaturas, todosPagamentos, planos, pacotes, aplicativos, apps, indicacoesStats, parceiro] = await Promise.all([
    getClienteById(id),
    getAssinaturasByClienteId(id),
    getPagamentosByClienteId(id, 999),
    getPlanos(),
    getPacotes(),
    getAplicativosByClienteId(id),
    getApps(),
    getIndicacoesStatsByParceiroId(id),
    getParceiroByIndicadoId(id),
  ]);

  // ✅ Inclui "atrasado" no card de destaque
  const ativa = [...assinaturas]
    .filter((a) => STATUS_DESTAQUE.includes((a.status ?? "").toLowerCase().trim()))
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
    <div className="space-y-2">

      {/* Navegacao */}
      <div className="flex items-center justify-between gap-3">
        <Link href="/clientes" className="text-sm text-zinc-600 hover:underline">
          &larr; Voltar
        </Link>
        <BuscaClienteRapida />
      </div>

      {/* Cabecalho do cliente */}
      <div className="rounded-xl border bg-white px-4 py-3 sticky top-2 z-20">
        <div className="flex items-center justify-between gap-3">
          {/* Esquerda: nome + dados inline */}
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-lg font-semibold leading-tight truncate">
                {cliente?.nome ?? `Cliente #${id}`}
              </h1>
              <ScoreFidelidade
                idCliente={id}
                score={cliente?.score_fidelidade ?? null}
                calculadoEm={cliente?.score_calculado_em ?? null}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1 text-xs text-zinc-500">
              <span>ID: <span className="font-medium text-zinc-800">{id}</span></span>
              {cliente?.telefone && (
                <span>Tel: <span className="font-medium text-zinc-800">{cliente.telefone}</span></span>
              )}
              {cliente?.criado_em && (
                <span>Cliente {tempoDesde(cliente.criado_em)}</span>
              )}
              <span>
                Assinaturas: <span className="font-medium text-zinc-900">{assinaturas.length}</span>
              </span>
              {indicacoesStats.total > 0 && (
                <span>
                  Indicações: <span className="font-medium text-zinc-900">{indicacoesStats.total}</span>
                  {indicacoesStats.abertas > 0 && (
                    <span className="ml-1 text-amber-600">({indicacoesStats.abertas} abertas)</span>
                  )}
                  {indicacoesStats.comissao > 0 && (
                    <span className="ml-1 text-emerald-600">(comissão)</span>
                  )}
                </span>
              )}
              {cliente?.observacao && (
                <span className="text-zinc-700">{cliente.observacao}</span>
              )}
            </div>
            <IndicadorInfo idCliente={id} parceiro={parceiro} />
          </div>

          {/* Direita: botões */}
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
      </div>
      {/* Assinatura em destaque (ativo / atrasado / pendente) */}
      {ativa && (
        <div className="rounded-xl border bg-white overflow-hidden">
          <div className={`px-3 py-2 border-b flex items-center justify-between text-xs font-medium ${headerDestaque(ativa.status)}`}>
            <span>
              {labelDestaque(ativa.status)}
              {(() => {
                const dias = diasDesdeUltimoPagamento(todosPagamentos);
                return dias !== null ? <span className="font-normal opacity-70"> ({dias} dias desde o último pagamento)</span> : null;
              })()}
            </span>
            {ativa.criado_em && (
              <span className="font-normal opacity-60">{tempoDesde(ativa.criado_em)}</span>
            )}
          </div>
          <div className="px-3 py-2">
            {/* Todos os campos em uma única grade horizontal */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-4 gap-y-2 text-sm">
              <div>
                <div className="text-xs text-zinc-500">ID</div>
                <div className="font-medium text-zinc-900">{ativa.id_assinatura}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Venc. contrato</div>
                <div className="font-medium text-zinc-900">
                  {ativa.venc_contrato ? ativa.venc_contrato.split("T")[0].split("-").reverse().join("/") : "--"}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Venc. contas</div>
                <div className="font-medium text-zinc-900">
                  {ativa.venc_contas ? ativa.venc_contas.split("T")[0].split("-").reverse().join("/") : "--"}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Status</div>
                <div className={`font-medium ${corStatusDestaque(ativa.status)}`}>{ativa.status}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Pacote</div>
                <div className="font-medium text-zinc-900">
                  {ativa.pacote_contrato ?? <span className="text-zinc-400">--</span>}
                  {ativa.pacote_telas ? <span className="text-zinc-500 font-normal"> · {ativa.pacote_telas}t</span> : null}
                </div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Plano</div>
                <div className="font-medium text-zinc-900">
                  {ativa.plano_tipo ?? <span className="text-zinc-400">--</span>}
                  {ativa.plano_valor ? <span className="text-zinc-500 font-normal"> · R$ {parseFloat(ativa.plano_valor).toFixed(2)}</span> : null}
                </div>
              </div>
            </div>

            {(ativa.identificacao || ativa.observacao) && (
              <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-xs text-zinc-500">
                {ativa.identificacao && <span>Ident.: <span className="text-zinc-800">{ativa.identificacao}</span></span>}
                {ativa.observacao && <span>Obs.: <span className="text-zinc-800">{ativa.observacao}</span></span>}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-2">
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
                vencContasAtual={ativa.venc_contas ?? null}
                idCliente={id}
                nomeCliente={cliente?.nome ?? ""}
                pacoteNome={ativa.pacote_contrato ?? null}
                planoValor={ativa.plano_valor ?? null}
                idPlano={ativa.id_plano ?? null}
                planoTipo={ativa.plano_tipo ?? null}
                planoTelas={ativa.pacote_telas ?? null}
                status={ativa.status ?? null}
                planos={planos.map(p => ({
                  id_plano: String(p.id_plano),
                  tipo: p.tipo ?? "",
                  telas: p.telas ?? 0,
                  meses: p.meses ?? 1,
                  valor: String(p.valor ?? "0"),
                }))}
              />
            </div>
          </div>
        </div>
      )}

      {/* Tabela completa de assinaturas */}
      <div className="rounded-xl border bg-white overflow-hidden">
        <div className="px-3 py-2 border-b bg-zinc-50 text-xs font-medium text-zinc-700">
          Todas as assinaturas
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-xs">
            <thead className="text-zinc-600 bg-zinc-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium">ID</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
                <th className="px-3 py-2 text-left font-medium">Venc. contrato</th>
                <th className="px-3 py-2 text-left font-medium">Venc. contas</th>
                <th className="px-3 py-2 text-left font-medium">Identificacao</th>
                <th className="px-3 py-2 text-left font-medium">Pacote</th>
                <th className="px-3 py-2 text-left font-medium">Plano</th>
                <th className="px-3 py-2 text-left font-medium">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {outras.map((a) => (
                <tr key={a.id_assinatura} className={bgLinhaStatus(a.status)}>
                  <td className="px-3 py-2 font-medium text-zinc-900">{a.id_assinatura}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${badgeStatus(a.status)}`}>
                      {a.status ?? "--"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-zinc-700">{a.venc_contrato ?? "--"}</td>
                  <td className="px-3 py-2 text-zinc-700">{a.venc_contas ?? "--"}</td>
                  <td className="px-3 py-2 text-zinc-700">{a.identificacao ?? "--"}</td>
                  <td className="px-3 py-2">
                    {a.pacote_contrato ?? "--"}
                    {a.pacote_telas ? (
                      <span className="text-zinc-500"> · {a.pacote_telas}t</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {a.plano_tipo ?? "--"}
                    {a.plano_valor ? (
                      <span className="text-zinc-500"> · R$ {parseFloat(a.plano_valor).toFixed(2)}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
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
                        vencContasAtual={a.venc_contas ?? null}
                        idCliente={id}
                        nomeCliente={cliente?.nome ?? ""}
                        pacoteNome={a.pacote_contrato ?? null}
                        planoValor={a.plano_valor ?? null}
                        status={a.status ?? null}
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {outras.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-center text-zinc-500" colSpan={8}>
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
      <ListaIndicacoes idParceiro={id} />
    </div>
  );
}