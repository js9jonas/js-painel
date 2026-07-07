import type { AssinaturaRow, ContaPainelVinculada } from "@/lib/clientes";
import type { PlanoRow } from "@/lib/planos";
import type { PacoteRow } from "@/lib/pacotes";
import RenovarAssinatura from "@/components/clientes/RenovarAssinatura";
import EditAssinaturaButton from "@/components/assinaturas/EditAssinaturaButton";
import AdicionarContaModal from "@/components/clientes/AdicionarContaModal";
import ContasGroupClient from "@/components/clientes/ContasGroupClient";
import { tempoDesde } from "@/lib/tempo";

/** Rótulo legível do cabeçalho do card, por status */
export function labelStatusCard(status: string | null): string {
  switch ((status ?? "").toLowerCase().trim()) {
    case "pendente":  return "Assinatura pendente";
    case "atrasado":  return "Assinatura atrasada";
    case "vencido":   return "Assinatura vencida";
    case "inativo":   return "Assinatura inativa";
    case "cancelado": return "Assinatura cancelada";
    default:          return "Assinatura ativa";
  }
}

/** Classes de cor do cabeçalho do card, por status */
function headerCard(status: string | null): string {
  switch ((status ?? "").toLowerCase().trim()) {
    case "pendente":  return "bg-red-50 text-red-900";
    case "atrasado":  return "bg-yellow-50 text-yellow-900";
    case "vencido":   return "bg-zinc-100 text-zinc-600";
    case "inativo":   return "bg-zinc-100 text-zinc-500";
    case "cancelado": return "bg-zinc-100 text-zinc-500";
    default:          return "bg-emerald-50 text-emerald-900";
  }
}

/** Classes de cor do valor de status dentro do card */
function corStatusCard(status: string | null): string {
  switch ((status ?? "").toLowerCase().trim()) {
    case "pendente":  return "text-red-600";
    case "atrasado":  return "text-yellow-700";
    case "vencido":   return "text-zinc-500";
    case "inativo":   return "text-zinc-500";
    case "cancelado": return "text-zinc-500";
    default:          return "text-emerald-700";
  }
}

type Props = {
  assinatura: AssinaturaRow;
  idCliente: string;
  nomeCliente: string;
  contas: ContaPainelVinculada[];
  appsPorConta: Record<string, { id_app_registro: number; nome_app: string | null }[]>;
  paineisList: { id: number; nome: string; tipo: string }[];
  planos: PlanoRow[];
  pacotes: PacoteRow[];
  planosRenovar: { id_plano: string; tipo: string; telas: number; meses: number; valor: string }[];
  diasUltimoPagamento: number | null;
};

export default function AssinaturaCard({
  assinatura: a,
  idCliente,
  nomeCliente,
  contas,
  appsPorConta,
  paineisList,
  planos,
  pacotes,
  planosRenovar,
  diasUltimoPagamento,
}: Props) {
  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      <div className={`px-3 py-2 border-b flex items-center justify-between text-xs font-medium ${headerCard(a.status)}`}>
        <span>
          {labelStatusCard(a.status)}
          {diasUltimoPagamento === null ? null : diasUltimoPagamento === 0 ? (
            <span className="font-semibold text-blue-600 opacity-100"> (pago hoje)</span>
          ) : (
            <span className="font-normal opacity-70"> ({diasUltimoPagamento} dias desde o último pagamento)</span>
          )}
        </span>
        {a.criado_em && (
          <span className="font-normal opacity-60">{tempoDesde(a.criado_em)}</span>
        )}
      </div>
      <div className="px-3 py-2">
        {/* Grade de campos fixos — sempre 5 colunas */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-x-4 gap-y-2 text-sm">
          <div>
            <div className="text-xs text-zinc-500">ID</div>
            <div className="font-medium text-zinc-900">{a.id_assinatura}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">Venc. contrato</div>
            <div className="font-medium text-zinc-900">
              {a.venc_contrato ? a.venc_contrato.split("T")[0].split("-").reverse().join("/") : "--"}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">Status</div>
            <div className={`font-medium ${corStatusCard(a.status)}`}>{a.status}</div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">Pacote</div>
            <div className="font-medium text-zinc-900 flex items-center gap-1.5">
              {a.pacote_contrato ?? <span className="text-zinc-400">--</span>}
              {a.pacote_telas != null && (() => {
                const n = contas.length;
                const t = a.pacote_telas!;
                const [bg, fg] = n === t
                  ? ["bg-emerald-100", "text-emerald-700"]
                  : n < t
                  ? ["bg-amber-100", "text-amber-700"]
                  : ["bg-red-100", "text-red-700"];
                const tip = n === t ? `Assinatura OK (${n}/${t} contas)`
                  : n < t ? `Faltam contas na assinatura (${n}/${t})`
                  : `Conta além do pacote (${n}/${t})`;
                return (
                  <span className={`inline-flex rounded-full ${bg} ${fg} px-1.5 py-0.5 text-xs font-semibold cursor-help`} title={tip}>
                    {n}/{t}
                  </span>
                );
              })()}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500">Plano</div>
            <div className="font-medium text-zinc-900">
              {a.plano_tipo ?? <span className="text-zinc-400">--</span>}
              {a.plano_valor ? <span className="text-zinc-500 font-normal"> · R$ {parseFloat(a.plano_valor).toFixed(2)}</span> : null}
            </div>
          </div>
        </div>

        {(a.identificacao || a.observacao) && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2 text-xs text-zinc-500">
            {a.identificacao && <span>Ident.: <span className="text-zinc-800">{a.identificacao}</span></span>}
            {a.observacao && <span>Obs.: <span className="text-zinc-800">{a.observacao}</span></span>}
          </div>
        )}

        {/* Contas: vinculadas ou balão de sem vínculo */}
        <div className="mt-2 pt-2 border-t border-zinc-100">
          <ContasGroupClient
            contas={contas}
            idCliente={idCliente}
            vencContas={a.venc_contas ?? null}
            appsVinculados={new Map(Object.entries(appsPorConta))}
            emptyAction={
              <AdicionarContaModal
                idAssinatura={String(a.id_assinatura)}
                idCliente={idCliente}
                paineis={paineisList}
                compact
              />
            }
          />
        </div>

        <div className="flex justify-end gap-2 mt-2">
          <AdicionarContaModal
            idAssinatura={String(a.id_assinatura)}
            idCliente={idCliente}
            paineis={paineisList}
          />
          <EditAssinaturaButton
            idCliente={idCliente}
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
            idCliente={idCliente}
            nomeCliente={nomeCliente}
            pacoteNome={a.pacote_contrato ?? null}
            planoValor={a.plano_valor ?? null}
            idPlano={a.id_plano ?? null}
            planoTipo={a.plano_tipo ?? null}
            planoTelas={a.pacote_telas ?? null}
            status={a.status ?? null}
            contasVinculadas={contas}
            planos={planosRenovar}
          />
        </div>
      </div>
    </div>
  );
}
