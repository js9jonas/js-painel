"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { marcarIndicacoesCortesia } from "@/app/actions/indicacoes";
import type { ParceiroCortesiaRow } from "@/lib/indicacoes";

function addMeses(dataStr: string | null | undefined, meses: number): string {
    const base = dataStr ? new Date(dataStr + "T00:00:00") : new Date();
    base.setMonth(base.getMonth() + meses);
    return base.toISOString().split("T")[0];
}

type CortesiaModalProps = {
    parceiro: ParceiroCortesiaRow;
    idsSelecionados: string[];
    onClose: () => void;
    onSuccess: () => void;
};

function CortesiaModal({ parceiro, idsSelecionados, onClose, onSuccess }: CortesiaModalProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [isPending, startTransition] = useTransition();

    const vencAtual = parceiro.venc_contrato_parceiro;
    const vencContasAtual = parceiro.venc_contas_parceiro;

    const [vencContrato, setVencContrato] = useState(() => addMeses(vencAtual, 1));
    const [vencContas, setVencContas] = useState(() => addMeses(vencContasAtual, 1));

    async function handleConfirmar() {
        if (!parceiro.id_assinatura_parceiro) {
            alert("Parceiro nao possui assinatura ativa.");
            return;
        }
        setLoading(true);

        const resp = await fetch(`/api/assinaturas/${parceiro.id_assinatura_parceiro}/cortesia`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ dataManual: vencContrato, vencContasManual: vencContas }),
        });

        const j = await resp.json().catch(() => ({}));

        if (!resp.ok || j?.ok === false) {
            setLoading(false);
            alert(j?.error ?? "Erro ao conceder cortesia");
            return;
        }

        startTransition(async () => {
            await marcarIndicacoesCortesia(idsSelecionados, parceiro.id_parceiro);
            setLoading(false);
            onSuccess();
            router.refresh();
        });
    }

    const inputClass = "h-9 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-900 transition-all";
    const labelClass = "text-xs font-semibold text-zinc-700";

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl flex flex-col">
                <div className="px-6 pt-6 pb-4 border-b">
                    <h2 className="text-lg font-semibold text-zinc-900">Conceder cortesia</h2>
                    <p className="mt-1 text-xs text-zinc-500">
                        Parceiro: <span className="font-medium text-zinc-700">{parceiro.nome_parceiro ?? `#${parceiro.id_parceiro}`}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                        {idsSelecionados.length} indicacao(s) serao marcadas como cortesia
                    </p>
                </div>

                <div className="px-6 py-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className={labelClass}>Venc. contrato</label>
                            <input type="date" className={inputClass} value={vencContrato}
                                onChange={(e) => setVencContrato(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <label className={labelClass}>Venc. contas</label>
                            <input type="date" className={inputClass} value={vencContas}
                                onChange={(e) => setVencContas(e.target.value)} />
                        </div>
                    </div>
                    <p className="text-xs text-zinc-400">
                        Datas calculadas com +1 mes sobre o vencimento atual. Edite se necessario.
                    </p>

                    {!parceiro.id_assinatura_parceiro && (
                        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                            Atencao: parceiro nao possui assinatura ativa. Apenas as indicacoes serao marcadas.
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t flex justify-end gap-2">
                    <button onClick={onClose} disabled={loading}
                        className="h-9 rounded-xl border px-4 text-sm hover:bg-zinc-50 disabled:opacity-50">
                        Cancelar
                    </button>
                    <button onClick={handleConfirmar} disabled={loading || isPending}
                        className="h-9 rounded-xl bg-emerald-600 px-4 text-sm text-white font-medium hover:bg-emerald-700 disabled:opacity-50">
                        {loading || isPending ? "Salvando..." : "Confirmar cortesia"}
                    </button>
                </div>
            </div>
        </div>
    );
}

type Props = {
    parceiros: ParceiroCortesiaRow[];
};

export default function CortesiasIndicacaoPanel({ parceiros }: Props) {
    const [open, setOpen] = useState(false);
    const [expandido, setExpandido] = useState<string | null>(null);
    const [selecionados, setSelecionados] = useState<Record<string, string[]>>({});
    const [modalParceiro, setModalParceiro] = useState<ParceiroCortesiaRow | null>(null);

    function toggleIndicado(idParceiro: string, idIndicacao: string) {
        setSelecionados((prev) => {
            const atual = prev[idParceiro] ?? [];
            if (atual.includes(idIndicacao)) {
                return { ...prev, [idParceiro]: atual.filter((id) => id !== idIndicacao) };
            }
            return { ...prev, [idParceiro]: [...atual, idIndicacao] };
        });
    }

    function handleConceder(parceiro: ParceiroCortesiaRow) {
        const ids = selecionados[parceiro.id_parceiro] ?? [];
        if (ids.length < 2) {
            alert("Selecione pelo menos 2 indicacoes para conceder a cortesia.");
            return;
        }
        setModalParceiro(parceiro);
    }

    const STATUS_BADGE: Record<string, string> = {
        ativo: "bg-emerald-50 text-emerald-700",
        pendente: "bg-blue-50 text-blue-700",
        atrasado: "bg-yellow-50 text-yellow-700",
        vencido: "bg-orange-50 text-orange-700",
        inativo: "bg-zinc-100 text-zinc-500",
        cancelado: "bg-red-50 text-red-600",
    };

    return (
        <>
            <button
                onClick={() => setOpen(true)}
                className="h-10 rounded-xl border border-amber-300 bg-amber-50 px-4 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-all flex items-center gap-2"
            >
                🎁 Cortesias de indicacao
                {parceiros.length > 0 && (
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-200 text-xs font-bold text-amber-800">
                        {parceiros.length}
                    </span>
                )}
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">

                        <div className="px-6 pt-6 pb-4 border-b flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-zinc-900">Cortesias de indicacao</h2>
                                <p className="mt-1 text-xs text-zinc-500">
                                    Parceiros com 2 ou mais indicacoes abertas
                                </p>
                            </div>
                            <button onClick={() => setOpen(false)}
                                className="text-zinc-400 hover:text-zinc-600">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                            {parceiros.length === 0 && (
                                <p className="text-center text-sm text-zinc-400 py-8">
                                    Nenhum parceiro com indicacoes abertas suficientes.
                                </p>
                            )}

                            {parceiros.map((parceiro) => {
                                const ids = selecionados[parceiro.id_parceiro] ?? [];
                                const isExpanded = expandido === parceiro.id_parceiro;

                                return (
                                    <div key={parceiro.id_parceiro} className="rounded-xl border border-zinc-200 overflow-hidden">
                                        {/* Cabecalho do parceiro */}
                                        <div
                                            className="px-4 py-3 bg-zinc-50 flex items-center justify-between cursor-pointer hover:bg-zinc-100"
                                            onClick={() => setExpandido(isExpanded ? null : parceiro.id_parceiro)}
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="text-sm font-medium text-zinc-900">
                                                    <Link
                                                        href={`/clientes/${parceiro.id_parceiro}`}
                                                        className="hover:underline"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        {parceiro.nome_parceiro ?? `#${parceiro.id_parceiro}`}
                                                    </Link>
                                                </span>
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                                                    {parceiro.total_abertas} abertas
                                                </span>
                                                {ids.length > 0 && (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700">
                                                        {ids.length} selecionada(s)
                                                    </span>
                                                )}

                                            </div>
                                            <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                                                {parceiro.pacote_nome_parceiro && (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100">
                                                        {parceiro.pacote_nome_parceiro}
                                                    </span>
                                                )}
                                                {parceiro.venc_contrato_parceiro && (
                                                    <span>
                                                        Contrato:{" "}
                                                        <span className="font-medium text-zinc-700">
                                                            {new Date(parceiro.venc_contrato_parceiro + "T00:00:00").toLocaleDateString("pt-BR")}
                                                        </span>
                                                    </span>
                                                )}
                                                {parceiro.venc_contas_parceiro && (
                                                    <span>
                                                        Contas:{" "}
                                                        <span className="font-medium text-zinc-700">
                                                            {new Date(parceiro.venc_contas_parceiro + "T00:00:00").toLocaleDateString("pt-BR")}
                                                        </span>
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-2">
                                                {ids.length >= 2 && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); handleConceder(parceiro); }}
                                                        className="h-7 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700"
                                                    >
                                                        Conceder cortesia
                                                    </button>
                                                )}
                                                <svg
                                                    className={`w-4 h-4 text-zinc-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </div>
                                        </div>

                                        {/* Sublista de indicados */}
                                        {isExpanded && (
                                            <table className="w-full text-xs">
                                                <thead className="bg-zinc-50 border-t border-b border-zinc-100">
                                                    <tr>
                                                        <th className="px-4 py-2 text-left font-medium text-zinc-500 w-8"></th>
                                                        <th className="px-4 py-2 text-left font-medium text-zinc-500">Cliente</th>
                                                        <th className="px-4 py-2 text-left font-medium text-zinc-500">Pacote</th>
                                                        <th className="px-4 py-2 text-left font-medium text-zinc-500">Plano</th>
                                                        <th className="px-4 py-2 text-left font-medium text-zinc-500">Status</th>
                                                        <th className="px-4 py-2 text-left font-medium text-zinc-500">Vencimento</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-zinc-100">
                                                    {parceiro.indicados.map((ind) => {
                                                        const statusKey = (ind.status_assinatura ?? "inativo").toLowerCase().trim();
                                                        const checked = ids.includes(ind.id_indicacao);
                                                        return (
                                                            <tr key={ind.id_indicacao}
                                                                className={`hover:bg-zinc-50 cursor-pointer ${checked ? "bg-blue-50" : ""}`}
                                                                onClick={() => toggleIndicado(parceiro.id_parceiro, ind.id_indicacao)}
                                                            >
                                                                <td className="px-4 py-2.5">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={checked}
                                                                        onChange={() => toggleIndicado(parceiro.id_parceiro, ind.id_indicacao)}
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        className="rounded"
                                                                    />
                                                                </td>
                                                                <td className="px-4 py-2.5">
                                                                    <Link
                                                                        href={`/clientes/${ind.id_indicado}`}
                                                                        className="font-medium text-zinc-900 hover:underline"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    >
                                                                        {ind.nome_indicado ?? `#${ind.id_indicado}`}
                                                                    </Link>
                                                                </td>
                                                                <td className="px-4 py-2.5 text-zinc-600">{ind.pacote_nome ?? "--"}</td>
                                                                <td className="px-4 py-2.5 text-zinc-600">{ind.plano_tipo ?? "--"}</td>
                                                                <td className="px-4 py-2.5">
                                                                    {ind.status_assinatura ? (
                                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium capitalize ${STATUS_BADGE[statusKey] ?? "bg-zinc-100 text-zinc-500"}`}>
                                                                            {ind.status_assinatura}
                                                                        </span>
                                                                    ) : <span className="text-zinc-400">--</span>}
                                                                </td>
                                                                <td className="px-4 py-2.5 text-zinc-600">
                                                                    {ind.venc_contrato
                                                                        ? new Date(ind.venc_contrato + "T00:00:00").toLocaleDateString("pt-BR")
                                                                        : "--"}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="px-6 py-4 border-t flex justify-end">
                            <button onClick={() => setOpen(false)}
                                className="h-9 rounded-xl border px-4 text-sm hover:bg-zinc-50">
                                Fechar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {modalParceiro && (
                <CortesiaModal
                    parceiro={modalParceiro}
                    idsSelecionados={selecionados[modalParceiro.id_parceiro] ?? []}
                    onClose={() => setModalParceiro(null)}
                    onSuccess={() => {
                        setModalParceiro(null);
                        setOpen(false);
                        setSelecionados({});
                    }}
                />
            )}
        </>
    );
}