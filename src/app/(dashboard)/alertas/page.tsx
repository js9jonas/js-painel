// src/app/(dashboard)/alertas/page.tsx
export const dynamic = "force-dynamic";

import React from "react";
import Link from "next/link";
import { getAlertasContas, getAlertasApps } from "@/lib/alertas";
import { getSaldosServidores, getPrevisaoEsgotamento, getConsumoMensal } from "@/lib/saldoServidor";
import AdicionarMesContaButton from "@/components/alertas/AdicionarMesContaButton";
import AlertasAppsClient from "@/components/alertas/AlertasAppsClient";
import SaldoServidoresCard from "@/components/alertas/SaldoServidoresCard";
import SecaoRecolhivel from "@/components/alertas/SecaoRecolhivel";
import DefinirDataContaButton from "@/components/alertas/DefinirDataContaButton";
import RenovarViaAPIButton from "@/components/alertas/RenovarViaAPIButton";
import AutoRefresh from "@/components/AutoRefresh";

function diasRestantes(data: string): number {
    const hojeStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const hoje = new Date(hojeStr + 'T00:00:00');
    const venc = new Date(data + "T00:00:00");
    return Math.round((venc.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

function badgeDias(dias: number) {
    if (dias < 0) return "bg-red-100 text-red-700";
    if (dias === 0) return "bg-orange-100 text-orange-700";
    if (dias <= 2) return "bg-yellow-100 text-yellow-700";
    return "bg-blue-50 text-blue-700";
}

function labelDias(dias: number) {
    if (dias < 0) return `${Math.abs(dias)}d atrás`;
    if (dias === 0) return "Hoje";
    if (dias === 1) return "Amanhã";
    return `Em ${dias}d`;
}

export default async function AlertasPage() {
    const [contas, apps, saldos, previsoes, consumos] = await Promise.all([
        getAlertasContas(5),
        getAlertasApps(7),
        getSaldosServidores(),
        getPrevisaoEsgotamento(),
        getConsumoMensal(),
    ]);

    // Servidores com previsão < 15 dias
    const hojeStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
    const hoje = new Date(hojeStr + 'T00:00:00');
    const saldoMap = Object.fromEntries(saldos.map((s) => [s.id_servidor, s]));
    const servidoresCriticos = previsoes
        .filter((p) => {
            if (!p.data_esgotamento) return false;
            const dias = Math.round(
                (new Date(p.data_esgotamento + "T00:00:00").getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
            );
            return dias < 15;
        })
        .map((p) => {
            const dias = Math.round(
                (new Date(p.data_esgotamento! + "T00:00:00").getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24)
            );
            const [y, m, d] = p.data_esgotamento!.split("-");
            return {
                nome: saldoMap[p.id_servidor]?.codigo_publico ?? p.id_servidor,
                data: `${d}/${m}/${y}`,
                dias,
            };
        })
        .sort((a, b) => a.dias - b.dias);

    return (
        <div className="space-y-6">
            <AutoRefresh interval={5000} />
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-zinc-900">🚨 Alertas</h1>
                <p className="text-sm text-zinc-500 mt-1">
                    Contas a vencer em até 5 dias com contrato vigente • Aplicativos expirando em até 7 dias
                </p>
            </div>

            {/* Alerta de créditos críticos */}
            {servidoresCriticos.length > 0 && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 flex flex-wrap items-center gap-3">
                    <span className="text-sm font-semibold text-red-800 shrink-0">
                        ⚠️ Créditos críticos:
                    </span>
                    {servidoresCriticos.map((s) => (
                        <span
                            key={s.nome}
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold ${s.dias <= 0
                                ? "bg-red-600 text-white"
                                : s.dias <= 7
                                    ? "bg-red-100 text-red-700 ring-1 ring-red-300"
                                    : "bg-orange-100 text-orange-700 ring-1 ring-orange-300"
                                }`}
                        >
                            {s.nome}
                            <span className="opacity-75">•</span>
                            {s.data}
                            <span className="opacity-60">
                                ({s.dias <= 0 ? "vencido" : `${s.dias}d`})
                            </span>
                        </span>
                    ))}
                </div>
            )}

            {/* Lista 1: Contas */}
            <SecaoRecolhivel
                header={
                    <div className="px-5 py-4 bg-amber-50 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-amber-900">💳 Contas a renovar</p>
                            <p className="text-xs text-amber-700 mt-0.5">Venc. conta ≤ 5 dias • Contrato ainda vigente</p>
                        </div>
                        <span className="text-2xl font-bold text-amber-900 mr-3">{contas.length}</span>
                    </div>
                }
            >
                {contas.length === 0 ? (
                    <div className="px-5 py-10 text-center text-zinc-400 text-sm">
                        Nenhuma conta a renovar no momento ✅
                    </div>
                ) : (
                    <div className="overflow-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-zinc-50 border-b">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 uppercase">Cliente</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 uppercase">Pacote</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 uppercase">Venc. Conta</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 uppercase">Venc. Contrato</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 uppercase">Prazo</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 uppercase">Ação</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                                {contas.map((r) => {
                                    const diasContas = r.venc_contas ? diasRestantes(r.venc_contas.split("T")[0]) : null;
                                    const vinculado = r.pacote_telas !== null && r.contas_vinculadas_total === r.pacote_telas;
                                    const hojeStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
                                    const subContasHoje = r.sub_contas.filter(ct =>
                                        ct.vencimento_real_painel.split("T")[0] >= hojeStr
                                    );
                                    return (
                                        <React.Fragment key={r.id_assinatura}>
                                            {/* Linha da assinatura */}
                                            <tr className="hover:bg-zinc-50/50 bg-white">
                                                <td className="px-4 py-3">
                                                    <Link
                                                        href={`/clientes/${r.id_cliente}`}
                                                        className="font-medium text-zinc-900 hover:underline hover:text-zinc-600"
                                                    >
                                                        {r.nome}
                                                    </Link>
                                                    <div className="text-xs text-zinc-400">ID {r.id_cliente}</div>
                                                </td>
                                                <td className="px-4 py-3 text-zinc-600">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        {r.pacote_contrato ?? "—"}
                                                        {vinculado && (
                                                            <span
                                                                className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"
                                                                title="Todas as contas vinculadas"
                                                            >
                                                                🔗
                                                            </span>
                                                        )}
                                                    </div>
                                                    {r.status && (
                                                        <div className="text-xs mt-0.5">
                                                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium capitalize ${
                                                                r.status.toLowerCase() === "ativo" ? "bg-emerald-50 text-emerald-700" :
                                                                r.status.toLowerCase() === "pendente" ? "bg-blue-50 text-blue-700" :
                                                                r.status.toLowerCase() === "atrasado" ? "bg-yellow-50 text-yellow-700" :
                                                                "bg-zinc-100 text-zinc-500"
                                                            }`}>
                                                                {r.status}
                                                            </span>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 font-medium text-zinc-900">
                                                    {r.venc_contas ? r.venc_contas.split("T")[0].split("-").reverse().join("/") : "—"}
                                                </td>
                                                <td className="px-4 py-3 text-zinc-600">
                                                    {r.venc_contrato.split("T")[0].split("-").reverse().join("/")}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {diasContas !== null && (
                                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${badgeDias(diasContas)}`}>
                                                            {labelDias(diasContas)}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    {subContasHoje.length === 0 && (
                                                        <div className="flex items-center gap-2">
                                                            <AdicionarMesContaButton idAssinatura={r.id_assinatura} />
                                                            <DefinirDataContaButton
                                                                idAssinatura={r.id_assinatura}
                                                                vencContas={r.venc_contas?.split("T")[0] ?? ""}
                                                            />
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>

                                            {/* Sub-linhas: contas com validade >= hoje ou balão sem vínculo */}
                                            {subContasHoje.length > 0
                                                ? subContasHoje.map((ct) => {
                                                    const diasCt = diasRestantes(ct.vencimento_real_painel.split("T")[0]);
                                                    const dataFmt = ct.vencimento_real_painel.split("T")[0].split("-").reverse().join("/");
                                                    return (
                                                        <tr key={ct.id_conta} className="bg-zinc-50/60 hover:bg-zinc-100/60">
                                                            <td className="px-4 py-2 pl-8">
                                                                <span className="text-xs text-zinc-400">↳ conta IPTV</span>
                                                            </td>
                                                            <td className="px-4 py-2">
                                                                {ct.nome_painel && (
                                                                    <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                                                        🔗 {ct.nome_painel}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-2" colSpan={2}>
                                                                <div className="inline-flex flex-col items-start gap-0.5">
                                                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${badgeDias(diasCt)}`}>
                                                                        {dataFmt}
                                                                    </span>
                                                                    <span className="text-xs text-zinc-400 pl-1 underline">{ct.usuario}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-2">
                                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${badgeDias(diasCt)}`}>
                                                                    {labelDias(diasCt)}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-2">
                                                                <RenovarViaAPIButton
                                                                    idPainelServidor={ct.id_painel_servidor}
                                                                    usuario={ct.usuario}
                                                                />
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                                : (
                                                    <tr className="bg-zinc-50/40">
                                                        <td colSpan={6} className="px-4 py-2 pl-8">
                                                            <div className="inline-flex items-center gap-2 rounded-lg bg-zinc-50 border border-dashed border-zinc-300 px-3 py-1 text-xs text-zinc-400">
                                                                <span className="font-medium">Conta sem vínculo</span>
                                                                {r.venc_contas && (
                                                                    <>
                                                                        <span className="text-zinc-300">·</span>
                                                                        <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-zinc-500">
                                                                            {r.venc_contas.split("T")[0].split("-").reverse().join("/")}
                                                                        </span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )
                                            }
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </SecaoRecolhivel>

            {/* Lista 2: Aplicativos */}
            <AlertasAppsClient apps={apps} recolhivel />

            {/* Lista 3: Saldo de servidores */}
            <SaldoServidoresCard saldos={saldos} previsoes={previsoes} consumos={consumos} recolhivel />
        </div>
    );
}