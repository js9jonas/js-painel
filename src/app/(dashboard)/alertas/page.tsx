// src/app/(dashboard)/alertas/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import { getAlertasContas, getAlertasApps } from "@/lib/alertas";
import AdicionarMesContaButton from "@/components/alertas/AdicionarMesContaButton";

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
    const [contas, apps] = await Promise.all([
        getAlertasContas(5),
        getAlertasApps(7),
    ]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-zinc-900">🚨 Alertas</h1>
                <p className="text-sm text-zinc-500 mt-1">
                    Contas a vencer em até 5 dias com contrato vigente • Aplicativos expirando em até 7 dias
                </p>
            </div>

            {/* Lista 1: Contas */}
            <div className="rounded-2xl border bg-white overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b bg-amber-50 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-semibold text-amber-900">💳 Contas a renovar</p>
                        <p className="text-xs text-amber-700 mt-0.5">Venc. conta ≤ 5 dias • Contrato ainda vigente</p>
                    </div>
                    <span className="text-2xl font-bold text-amber-900">{contas.length}</span>
                </div>

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
                                                <AdicionarMesContaButton idAssinatura={r.id_assinatura} />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Lista 2: Aplicativos */}
            <div className="rounded-2xl border bg-white overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b bg-blue-50 flex items-center justify-between">
                    <div>
                        <p className="text-sm font-semibold text-blue-900">📱 Aplicativos expirando</p>
                        <p className="text-xs text-blue-700 mt-0.5">Validade ≤ 7 dias • Status ativa</p>
                    </div>
                    <span className="text-2xl font-bold text-blue-900">{apps.length}</span>
                </div>

                {apps.length === 0 ? (
                    <div className="px-5 py-10 text-center text-zinc-400 text-sm">
                        Nenhum aplicativo expirando no momento ✅
                    </div>
                ) : (
                    <div className="overflow-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-zinc-50 border-b">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 uppercase">Cliente</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 uppercase">App</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 uppercase">MAC</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 uppercase">Validade</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-600 uppercase">Prazo</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100">
                                {apps.map((r) => {
                                    const dias = diasRestantes(r.validade);
                                    return (
                                        <tr key={r.id_app_registro} className="hover:bg-zinc-50/50">
                                            <td className="px-4 py-3">
                                                <Link
                                                    href={`/clientes/${r.id_cliente}`}
                                                    className="font-medium text-zinc-900 hover:underline hover:text-zinc-600"
                                                >
                                                    {r.nome}
                                                </Link>
                                                <div className="text-xs text-zinc-400">ID {r.id_cliente}</div>
                                            </td>
                                            <td className="px-4 py-3 text-zinc-700">{r.nome_app}</td>
                                            <td className="px-4 py-3 font-mono text-xs text-zinc-500">{r.mac ?? "—"}</td>
                                            <td className="px-4 py-3 font-medium text-zinc-900">
                                                {r.validade.split("T")[0].split("-").reverse().join("/")}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${badgeDias(dias)}`}>
                                                    {labelDias(dias)}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
