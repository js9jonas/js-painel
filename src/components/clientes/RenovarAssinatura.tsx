"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Periodo = "mensal" | "trimestral" | "semestral" | "anual";

const FORMAS_PGTO = ["PIX", "Nubank", "Lotérica", "Dinheiro", "Sicredi", "Caixa", "Banrisul", "Outro"];

export default function RenovarAssinatura({
    idAssinatura,
    vencAtual,
    idCliente,
    nomeCliente,
    pacoteNome,
    planoValor,
    idPlano,
    planos,
    planoTipo,
    planoTelas,
}: {
    idAssinatura: string;
    vencAtual?: string | null;
    idCliente?: string;
    nomeCliente?: string;
    pacoteNome?: string | null;
    planoValor?: string | null;
    idPlano?: string | null;
    planos?: { id_plano: string; tipo: string; telas: number; meses: number; valor: string }[];
    planoTipo?: string | null;
    planoTelas?: number | null;

}) {
    const router = useRouter();
    const mesesDoPeriodo = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };
    function valorDoPeriodo(p: Periodo): string {
        try {
            if (!planos || !planoTipo) return planoValor ? parseFloat(planoValor).toFixed(2) : "";
            const meses = mesesDoPeriodo[p];
            const encontrado = planos.find(
                (pl) => pl.tipo === planoTipo && pl.telas === (planoTelas ?? pl.telas) && pl.meses === meses
            );
            if (encontrado) return parseFloat(encontrado.valor).toFixed(2);
            return planoValor ? parseFloat(planoValor).toFixed(2) : "";
        } catch {
            return planoValor ? parseFloat(planoValor).toFixed(2) : "";
        }
    }

    const [open, setOpen] = useState(false);
    const [periodo, setPeriodo] = useState<Periodo>("mensal");
    const [dataManual, setDataManual] = useState("");
    const [ativar, setAtivar] = useState(true);
    const [loading, setLoading] = useState(false);

    // Campos de pagamento
    const [forma, setForma] = useState("PIX");
    const [valor, setValor] = useState(() => valorDoPeriodo("mensal"));

    async function executar(registrarPagamento: boolean) {
        if (!idAssinatura) { alert("ID da assinatura inválido."); return; }
        if (registrarPagamento && !valor.trim()) { alert("Informe o valor do pagamento."); return; }

        setLoading(true);

        const resp = await fetch(`/api/assinaturas/${idAssinatura}/renovar`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                periodo,
                dataManual: dataManual.trim() ? dataManual : null,
                ativar,
                registrarPagamento,
                pagamento: registrarPagamento ? {
                    idCliente,
                    nomeCliente,
                    pacoteNome,
                    forma,
                    valor,
                } : null,
            }),
        });

        const text = await resp.text();
        let j: any = {};
        try { j = JSON.parse(text); } catch { }

        setLoading(false);

        if (!resp.ok || j?.ok === false) {
            alert(j?.error ?? text ?? `Erro HTTP ${resp.status}`);
            return;
        }

        setOpen(false);
        router.refresh();
    }

    const inputClass = "h-9 w-full rounded-xl border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-zinc-900 transition-all";

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="h-8 rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800"
            >
                Renovar
            </button>

            {open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh]">

                        <div className="px-6 pt-6 pb-4 border-b">
                            <h2 className="text-lg font-semibold text-zinc-900">Renovar assinatura</h2>
                            <p className="mt-1 text-xs text-zinc-500">
                                Assinatura #{idAssinatura}
                                {vencAtual ? ` • vencimento atual: ${vencAtual}` : ""}
                            </p>
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

                            {/* Período */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-zinc-700">Período</label>
                                <select className={inputClass} value={periodo} onChange={(e) => {
                                    const p = e.target.value as Periodo;
                                    setPeriodo(p);
                                    setValor(valorDoPeriodo(p));
                                }}>
                                    <option value="mensal">Mensal (1 mês)</option>
                                    <option value="trimestral">Trimestral (3 meses)</option>
                                    <option value="semestral">Semestral (6 meses)</option>
                                    <option value="anual">Anual (12 meses)</option>
                                </select>
                            </div>

                            {/* Data manual */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-zinc-700">Ou definir data manual (prioridade)</label>
                                <input type="date" className={inputClass} value={dataManual} onChange={(e) => setDataManual(e.target.value)} />
                                <p className="text-xs text-zinc-400">Se preencher a data manual, ela será usada no lugar do período.</p>
                            </div>

                            {/* Ativar */}
                            <label className="flex items-center gap-2 text-sm text-zinc-700">
                                <input type="checkbox" checked={ativar} onChange={(e) => setAtivar(e.target.checked)} />
                                Marcar status como <b>ativo</b>
                            </label>

                            {/* Separador pagamento */}
                            <div className="border-t pt-4 space-y-3">
                                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Dados do pagamento</p>

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-zinc-700">Forma</label>
                                        <select className={inputClass} value={forma} onChange={(e) => setForma(e.target.value)}>
                                            {FORMAS_PGTO.map((f) => (
                                                <option key={f} value={f}>{f}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-zinc-700">Valor (R$)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className={inputClass}
                                            value={valor}
                                            onChange={(e) => setValor(e.target.value)}
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t flex justify-end gap-2">
                            <button type="button" onClick={() => setOpen(false)} disabled={loading}
                                className="h-9 rounded-xl border px-4 text-sm hover:bg-zinc-50 disabled:opacity-50">
                                Cancelar
                            </button>
                            <button type="button" onClick={() => executar(false)} disabled={loading}
                                className="h-9 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50">
                                {loading ? "..." : "Alterar"}
                            </button>
                            <button type="button" onClick={() => executar(true)} disabled={loading}
                                className="h-9 rounded-xl bg-emerald-600 px-4 text-sm text-white font-medium hover:bg-emerald-700 disabled:opacity-50">
                                {loading ? "Salvando..." : "✓ Renovar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}