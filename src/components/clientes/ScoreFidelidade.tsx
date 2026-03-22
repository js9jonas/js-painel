"use client";

import { useState } from "react";

type AssinaturaMetrica = {
    id_assinatura: string;
    status: string;
    inicio: string;
    fim: string;
    total_pgtos: number;
    meses_esperados: number;
    cobertura_pct: number;
    desvio_dias: number;
    maior_gap: number;
    dias_sem_pagar_ate_fim: number | null;
};

type Metricas = {
    total_pagamentos: number;
    primeiro_pgto: string;
    ultimo_pgto: string;
    ticket_medio: string;
    cortesias: number;
    assinaturas: AssinaturaMetrica[];
    recente: {
        total_pgtos_12m: number;
        ticket_medio_12m: string;
        media_intervalo_12m: number;
        desvio_12m: number;
        maior_gap_12m: number;
        pgtos_atrasados_12m: number;
        cortesias_12m: number;
        primeiro_pgto_12m: string;
        ultimo_pgto_12m: string;
    } | null;
};

type Props = {
    idCliente: string;
    score: number | null;
    calculadoEm: string | null;
};

function Estrelas({ score }: { score: number }) {
    const estrelas = Math.round(score);
    return (
        <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
                <svg
                    key={i}
                    className={`w-4 h-4 ${i <= estrelas ? "text-amber-400" : "text-zinc-200"}`}
                    fill="currentColor"
                    viewBox="0 0 20 20"
                >
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
            ))}
        </div>
    );
}

const STATUS_BADGE: Record<string, string> = {
    ativo: "bg-emerald-50 text-emerald-700",
    inativo: "bg-zinc-100 text-zinc-500",
    cancelado: "bg-red-50 text-red-600",
    pendente: "bg-blue-50 text-blue-700",
    atrasado: "bg-yellow-50 text-yellow-700",
    vencido: "bg-orange-50 text-orange-700",
};

export default function ScoreFidelidade({ idCliente, score, calculadoEm }: Props) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [resumo, setResumo] = useState<string | null>(null);
    const [metricas, setMetricas] = useState<Metricas | null>(null);
    const [erro, setErro] = useState<string | null>(null);

    if (score === null) return null;

    const scoreNum = typeof score === "string" ? parseFloat(score) : score;
    const data = calculadoEm
        ? new Date(calculadoEm).toLocaleDateString("pt-BR")
        : null;

    async function handleOpen() {
        setOpen(true);
        if (resumo) return; // já carregado
        setLoading(true);
        setErro(null);
        try {
            const res = await fetch(`/api/clientes/${idCliente}/score-resumo`);
            const json = await res.json();
            if (!res.ok) throw new Error(json.error ?? "Erro ao carregar");
            setResumo(json.resumo);
            setMetricas(json.metricas);
        } catch (err: any) {
            setErro(err.message ?? "Erro ao carregar resumo");
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <button
                onClick={handleOpen}
                className="flex items-center gap-2 mt-1 hover:opacity-80 transition-opacity"
            >
                <Estrelas score={scoreNum} />
                <span className="text-sm font-semibold text-zinc-800">{scoreNum.toFixed(1)}</span>
                <span className="text-xs text-zinc-400">fidelidade</span>
                {data && (
                    <span className="text-xs text-zinc-300">• {data}</span>
                )}
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl flex flex-col max-h-[90vh]">

                        <div className="px-6 pt-6 pb-4 border-b flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-3">
                                    <Estrelas score={scoreNum} />
                                    <span className="text-lg font-semibold text-zinc-900">{scoreNum.toFixed(1)} / 5.0</span>
                                </div>
                                <p className="text-xs text-zinc-400 mt-1">Score de fidelidade</p>
                            </div>
                            <button onClick={() => setOpen(false)} className="text-zinc-400 hover:text-zinc-600">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
                            {loading && (
                                <div className="flex items-center justify-center py-12">
                                    <div className="text-sm text-zinc-400 animate-pulse">Analisando historico do cliente...</div>
                                </div>
                            )}

                            {erro && (
                                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
                                    {erro}
                                </div>
                            )}

                            {!loading && metricas && (
                                <>
                                    {/* Metricas gerais */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        <div className="rounded-xl bg-zinc-50 p-3">
                                            <div className="text-xs text-zinc-500 mb-1">Total pagamentos</div>
                                            <div className="text-lg font-semibold text-zinc-900">{metricas.total_pagamentos}</div>
                                        </div>
                                        <div className="rounded-xl bg-zinc-50 p-3">
                                            <div className="text-xs text-zinc-500 mb-1">Ticket medio</div>
                                            <div className="text-lg font-semibold text-zinc-900">R$ {parseFloat(metricas.ticket_medio).toFixed(2)}</div>
                                        </div>
                                        <div className="rounded-xl bg-zinc-50 p-3">
                                            <div className="text-xs text-zinc-500 mb-1">Primeiro pgto</div>
                                            <div className="text-sm font-semibold text-zinc-900">
                                                {new Date(metricas.primeiro_pgto + "T00:00:00").toLocaleDateString("pt-BR")}
                                            </div>
                                        </div>
                                        <div className="rounded-xl bg-zinc-50 p-3">
                                            <div className="text-xs text-zinc-500 mb-1">Ultimo pgto</div>
                                            <div className="text-sm font-semibold text-zinc-900">
                                                {new Date(metricas.ultimo_pgto + "T00:00:00").toLocaleDateString("pt-BR")}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Metricas 12 meses */}
                                    {metricas.recente && (
                                        <div>
                                            <p className="text-xs font-semibold text-zinc-500 uppercase mb-2">Ultimos 12 meses</p>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                <div className="rounded-xl bg-blue-50 p-3">
                                                    <div className="text-xs text-blue-500 mb-1">Pagamentos</div>
                                                    <div className="text-lg font-semibold text-blue-900">{metricas.recente.total_pgtos_12m}</div>
                                                </div>
                                                <div className="rounded-xl bg-blue-50 p-3">
                                                    <div className="text-xs text-blue-500 mb-1">Intervalo medio</div>
                                                    <div className="text-lg font-semibold text-blue-900">{metricas.recente.media_intervalo_12m} dias</div>
                                                </div>
                                                <div className="rounded-xl bg-blue-50 p-3">
                                                    <div className="text-xs text-blue-500 mb-1">Desvio</div>
                                                    <div className={`text-lg font-semibold ${Number(metricas.recente.desvio_12m) <= 10 ? "text-emerald-600" : Number(metricas.recente.desvio_12m) <= 35 ? "text-amber-600" : "text-red-600"}`}>
                                                        {metricas.recente.desvio_12m} dias
                                                    </div>
                                                </div>
                                                <div className="rounded-xl bg-blue-50 p-3">
                                                    <div className="text-xs text-blue-500 mb-1">Maior gap</div>
                                                    <div className={`text-lg font-semibold ${Number(metricas.recente.maior_gap_12m) < 45 ? "text-emerald-600" : Number(metricas.recente.maior_gap_12m) < 90 ? "text-amber-600" : "text-red-600"}`}>
                                                        {metricas.recente.maior_gap_12m} dias
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Metricas por assinatura */}
                                    <div>
                                        <p className="text-xs font-semibold text-zinc-500 uppercase mb-2">Por assinatura</p>
                                        <div className="space-y-2">
                                            {metricas.assinaturas.map((a, i) => (
                                                <div key={a.id_assinatura} className="rounded-xl border border-zinc-100 p-3">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-xs font-medium text-zinc-700">
                                                            Assinatura {i + 1} — #{a.id_assinatura}
                                                        </span>
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium capitalize ${STATUS_BADGE[a.status] ?? "bg-zinc-100 text-zinc-500"}`}>
                                                            {a.status}
                                                        </span>
                                                    </div>
                                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                                        <div>
                                                            <span className="text-zinc-400">Periodo</span>
                                                            <div className="text-zinc-700 font-medium">
                                                                {new Date(a.inicio + "T00:00:00").toLocaleDateString("pt-BR")} —{" "}
                                                                {new Date(a.fim + "T00:00:00").toLocaleDateString("pt-BR")}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <span className="text-zinc-400">Cobertura</span>
                                                            <div className={`font-medium ${Number(a.cobertura_pct) >= 80 ? "text-emerald-600" : Number(a.cobertura_pct) >= 60 ? "text-amber-600" : "text-red-600"}`}>
                                                                {a.cobertura_pct}% ({a.total_pgtos}/{a.meses_esperados} meses)
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <span className="text-zinc-400">Desvio</span>
                                                            <div className={`font-medium ${Number(a.desvio_dias) <= 10 ? "text-emerald-600" : Number(a.desvio_dias) <= 35 ? "text-amber-600" : "text-red-600"}`}>
                                                                {a.desvio_dias} dias
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <span className="text-zinc-400">Maior gap</span>
                                                            <div className={`font-medium ${Number(a.maior_gap) < 45 ? "text-emerald-600" : Number(a.maior_gap) < 90 ? "text-amber-600" : "text-red-600"}`}>
                                                                {a.maior_gap} dias
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {a.status !== "ativo" && a.dias_sem_pagar_ate_fim !== null && Number(a.dias_sem_pagar_ate_fim) > 30 && (
                                                        <div className="mt-2 text-xs text-red-500">
                                                            ⚠️ {a.dias_sem_pagar_ate_fim} dias sem pagar antes do encerramento
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Resumo IA */}
                                    {resumo && (
                                        <div>
                                            <p className="text-xs font-semibold text-zinc-500 uppercase mb-2">Analise</p>
                                            <div className="rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3 text-sm text-zinc-700 leading-relaxed whitespace-pre-wrap">
                                                {resumo}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
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
        </>
    );
}