// src/app/(dashboard)/alertas/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import { getAlertasContas, getAlertasApps } from "@/lib/alertas";
import { getSaldosServidores, getPrevisaoEsgotamento, getConsumoMensal } from "@/lib/saldoServidor";
import AdicionarMesContaButton from "@/components/alertas/AdicionarMesContaButton";
import AlertasAppsClient from "@/components/alertas/AlertasAppsClient";
import SaldoServidoresCard from "@/components/alertas/SaldoServidoresCard";
import SecaoRecolhivel from "@/components/alertas/SecaoRecolhivel";
import DefinirDataContaButton from "@/components/alertas/DefinirDataContaButton";
import AutoRefresh from "@/components/AutoRefresh";

function diasRestantes(data: string): number {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
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
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
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
                                    const dias = diasRestantes(r.venc_contas);
                                    return (
                                        <tr key={r.id_assinatura} className="hover:bg-zinc-50/50">
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
                                                {r.pacote_contrato ?? "—"}
                                                {r.pacote_telas ? <span className="text-zinc-400"> • {r.pacote_telas} tela{r.pacote_telas !== 1 ? "s" : ""}</span> : null}
                                                {r.status && (
                                                    <div className="text-xs mt-0.5">
                                                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium capitalize ${r.status.toLowerCase() === "ativo" ? "bg-emerald-50 text-emerald-700" :
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
                                                {r.venc_contas.split("T")[0].split("-").reverse().join("/")}
                                            </td>
                                            <td className="px-4 py-3 text-zinc-600">
                                                {r.venc_contrato.split("T")[0].split("-").reverse().join("/")}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${badgeDias(dias)}`}>
                                                    {labelDias(dias)}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <AdicionarMesContaButton idAssinatura={r.id_assinatura} />
                                                    <DefinirDataContaButton
                                                        idAssinatura={r.id_assinatura}
                                                        vencContas={r.venc_contas.split("T")[0]}
                                                    />
                                                </div>
                                            </td>
                                        </tr>
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