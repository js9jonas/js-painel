export const dynamic = "force-dynamic";

import Link from "next/link";
import { getAssinaturasByClienteId, getClienteById, getPagamentosByClienteId, getContasPainelByClienteId, type ContaPainelVinculada } from "@/lib/clientes";
import { getAuditLogByClienteId } from "@/lib/audit";
import { getPlanos } from "@/lib/planos";
import { getPacotes } from "@/lib/pacotes";
import { getAplicativosByClienteId, getApps } from "@/lib/aplicativos";
import RowActions from "@/components/clientes/RowActions";
import TabelaPagamentos from "@/components/clientes/TabelaPagamentos";
import AplicativosManager from "@/components/aplicativos/AplicativosManager";
import NovaAssinaturaButton from "../../../../components/assinaturas/NovaAssinaturaButton";
import BuscaClienteRapida from "@/components/clientes/BuscaClienteRapida";
import ListaIndicacoes from "@/components/clientes/ListaIndicacoes";
import { tempoDesde } from "@/lib/tempo";
import { getIndicacoesStatsByParceiroId } from "@/lib/indicacoes";
import IndicadorInfo from "@/components/clientes/IndicadorInfo";
import { getParceiroByIndicadoId } from "@/lib/indicacoes";
import ScoreFidelidade from "@/components/clientes/ScoreFidelidade";
import HistoricoAudit from "@/components/clientes/HistoricoAudit";
import AssinaturaCard from "@/components/clientes/AssinaturaCard";
import AssinaturasInativasGroup from "@/components/clientes/AssinaturasInativasGroup";
import { pool } from "@/lib/db";

type Props = {
  params: Promise<{ id: string }>;
};

// ─── helpers de status ────────────────────────────────────────────────────────

/** Status que merecem card expandido (mesmo layout da assinatura principal) */
const STATUS_DESTAQUE = ["ativo", "atrasado", "vencido", "pendente"];

/** Dias desde o último pagamento da lista (já ordenada por data DESC) */
function diasDesdeUltimoPagamento(pagamentos: { data_pgto: string | null }[]): number | null {
  const ultimo = pagamentos.find(p => p.data_pgto);
  if (!ultimo?.data_pgto) return null;
  const hojeStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const hoje = new Date(hojeStr + 'T00:00:00');
  const diff = hoje.getTime() - new Date(ultimo.data_pgto + 'T00:00:00').getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// ─────────────────────────────────────────────────────────────────────────────

export default async function ClienteDetalhePage({ params }: Props) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId).trim();

  const [cliente, assinaturas, todosPagamentos, planos, pacotes, aplicativos, apps, indicacoesStats, parceiro, auditLog, contasPainel, paineisList] = await Promise.all([
    getClienteById(id),
    getAssinaturasByClienteId(id),
    getPagamentosByClienteId(id, 999),
    getPlanos(),
    getPacotes(),
    getAplicativosByClienteId(id),
    getApps(),
    getIndicacoesStatsByParceiroId(id),
    getParceiroByIndicadoId(id),
    getAuditLogByClienteId(id),
    getContasPainelByClienteId(id),
    pool.query<{ id: number; nome: string; tipo: string }>(
      `SELECT id, nome, tipo FROM public.painel_servidores WHERE ativo = true ORDER BY nome`
    ).then(r => r.rows),
  ]);

  const contasPorAssinatura: Record<string, ContaPainelVinculada[]> = {};
  for (const c of contasPainel) {
    (contasPorAssinatura[c.id_assinatura] ??= []).push(c);
  }

  // Mapa id_conta → apps vinculados (para alerta no modal de edição)
  const appsPorConta: Record<string, { id_app_registro: number; nome_app: string | null }[]> = {};
  for (const app of aplicativos) {
    if (app.id_conta != null) {
      const key = String(app.id_conta);
      (appsPorConta[key] ??= []).push({ id_app_registro: app.id_app_registro, nome_app: app.nome_app });
    }
  }

  // Toda assinatura ativa/atrasada/vencida/pendente ganha card expandido — sem escolher só uma "destaque"
  const emDestaque = [...assinaturas]
    .filter((a) => STATUS_DESTAQUE.includes((a.status ?? "").toLowerCase().trim()))
    .sort((a, b) => {
      if (!a.venc_contrato) return 1;
      if (!b.venc_contrato) return -1;
      return a.venc_contrato.localeCompare(b.venc_contrato);
    });

  // Inativas/canceladas ficam recolhidas num grupo único
  const inativas = assinaturas
    .filter((a) => !STATUS_DESTAQUE.includes((a.status ?? "").toLowerCase().trim()))
    .sort((a, b) => {
      if (!a.venc_contrato) return 1;
      if (!b.venc_contrato) return -1;
      return b.venc_contrato.localeCompare(a.venc_contrato);
    });

  // "Dias desde o último pagamento" por assinatura: filtra pelo id_assinatura quando o
  // pagamento já tiver esse vínculo salvo. Sem vínculo próprio, cai no fallback — mas o
  // fallback só pode considerar lançamentos SEM id_assinatura (legado); pagamentos já
  // vinculados a OUTRA assinatura do mesmo cliente não podem "vazar" pra esta.
  const pagamentosSemVinculo = todosPagamentos.filter((p) => p.id_assinatura === null);
  const diasPorAssinatura: Record<string, number | null> = {};
  for (const a of assinaturas) {
    const doAssinatura = todosPagamentos.filter((p) => p.id_assinatura === a.id_assinatura);
    diasPorAssinatura[a.id_assinatura] = diasDesdeUltimoPagamento(
      doAssinatura.length > 0 ? doAssinatura : pagamentosSemVinculo
    );
  }

  const planosRenovar = planos.map((p) => ({
    id_plano: String(p.id_plano),
    tipo: p.tipo ?? "",
    telas: p.telas ?? 0,
    meses: p.meses ?? 1,
    valor: String(p.valor ?? "0"),
  }));

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
      <div className="rounded-xl border bg-white px-4 py-3 sticky top-16 z-20">
        <div className="flex items-start justify-between gap-3">
          {/* Esquerda: nome + dados inline */}
          <div className="min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-lg font-semibold leading-tight flex-1 min-w-0">
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
      {/* Assinaturas ativas / atrasadas / vencidas / pendentes — todas em card expandido */}
      {assinaturas.length === 0 && (
        <div className="rounded-xl border bg-white px-4 py-6 text-center text-sm text-zinc-500">
          Nenhuma assinatura encontrada.
        </div>
      )}

      {emDestaque.map((a) => (
        <AssinaturaCard
          key={a.id_assinatura}
          assinatura={a}
          idCliente={id}
          nomeCliente={cliente?.nome ?? ""}
          contas={contasPorAssinatura[String(a.id_assinatura)] ?? []}
          appsPorConta={appsPorConta}
          paineisList={paineisList}
          planos={planos}
          pacotes={pacotes}
          planosRenovar={planosRenovar}
          diasUltimoPagamento={diasPorAssinatura[a.id_assinatura] ?? null}
        />
      ))}

      {/* Inativas/canceladas: recolhidas num único grupo, expandido sob demanda */}
      {inativas.length > 0 && (
        <AssinaturasInativasGroup
          assinaturas={inativas}
          idCliente={id}
          nomeCliente={cliente?.nome ?? ""}
          contasPorAssinatura={contasPorAssinatura}
          appsPorConta={appsPorConta}
          paineisList={paineisList}
          planos={planos}
          pacotes={pacotes}
          planosRenovar={planosRenovar}
          diasPorAssinatura={diasPorAssinatura}
        />
      )}

      <div className="rounded-xl border bg-white overflow-hidden">
        <AplicativosManager
          idCliente={id}
          nomeCliente={cliente?.nome ?? ""}
          aplicativos={aplicativos}
          apps={apps}
        />

        <TabelaPagamentos pagamentos={todosPagamentos} />
        <HistoricoAudit entradas={auditLog} />
      </div>
      <ListaIndicacoes idParceiro={id} />
    </div>
  );
}