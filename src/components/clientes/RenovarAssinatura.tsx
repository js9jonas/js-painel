"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Periodo = "mensal" | "trimestral" | "semestral" | "anual";
type StatusFinal = "ativo" | "pendente";

const FORMAS_PGTO = ["PIX", "Nu PJ", "Nubank", "Lotérica", "Dinheiro", "Sicredi", "Caixa", "Banrisul", "Outro"];
const MESES: Record<Periodo, number> = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };

function addMeses(dataStr: string | null | undefined, meses: number): string {
    const base = dataStr ? new Date(dataStr + "T00:00:00") : new Date();
    base.setMonth(base.getMonth() + meses);
    return base.toISOString().split("T")[0];
}

// DEPOIS
function calcVencContrato(
    vencAtual: string | null | undefined,
    periodo: Periodo,
    vencContasAtual?: string | null   // ← novo parâmetro
): string {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    if (vencAtual) {
        const venc = new Date(vencAtual + "T00:00:00");
        if (venc >= hoje) {
            // Contrato ainda válido → estende a partir dele
            return addMeses(vencAtual, MESES[periodo]);
        }
        // Contrato vencido — verifica contas antes de usar hoje como base
        if (vencContasAtual) {
            const vencContas = new Date(vencContasAtual + "T00:00:00");
            if (vencContas >= hoje) {
                // Contas ainda no prazo → estende contrato a partir de vencAtual mesmo assim
                return addMeses(vencAtual, MESES[periodo]);
            }
        }
        // Ambos vencidos → base é hoje
        return addMeses(undefined, MESES[periodo]);
    }
    return addMeses(undefined, MESES[periodo]);
}

function calcVencContas(vencContasAtual: string | null | undefined): string {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    if (vencContasAtual) {
        const venc = new Date(vencContasAtual + "T00:00:00");
        return addMeses(venc >= hoje ? vencContasAtual : undefined, 1);
    }
    return addMeses(undefined, 1);
}

export default function RenovarAssinatura({
    idAssinatura,
    vencAtual,
    vencContasAtual,
    idCliente,
    nomeCliente,
    pacoteNome,
    planoValor,
    idPlano,
    planos,
    planoTipo,
    planoTelas,
    status,
}: {
    idAssinatura: string;
    vencAtual?: string | null;
    vencContasAtual?: string | null;
    idCliente?: string;
    nomeCliente?: string;
    pacoteNome?: string | null;
    planoValor?: string | null;
    idPlano?: string | null;
    planos?: { id_plano: string; tipo: string; telas: number; meses: number; valor: string }[];
    planoTipo?: string | null;
    planoTelas?: number | null;
    status?: string | null;
}) {
    const router = useRouter();
    const isPendente = (status ?? "").toLowerCase().trim() === "pendente";

    function valorDoPeriodo(p: Periodo): string {
        try {
            if (!planos || !planoTipo) return planoValor ? parseFloat(planoValor).toFixed(2) : "";
            const encontrado = planos.find(
                (pl) => pl.tipo === planoTipo && pl.telas === (planoTelas ?? pl.telas) && pl.meses === MESES[p]
            );
            return encontrado ? parseFloat(encontrado.valor).toFixed(2) : (planoValor ? parseFloat(planoValor).toFixed(2) : "");
        } catch {
            return planoValor ? parseFloat(planoValor).toFixed(2) : "";
        }
    }

    const [open, setOpen] = useState(false);
    const [periodo, setPeriodo] = useState<Periodo>("mensal");
    const [statusFinal, setStatusFinal] = useState<StatusFinal>("ativo");
    const [loading, setLoading] = useState(false);
    const [forma, setForma] = useState("PIX");
    const [valor, setValor] = useState(() => valorDoPeriodo("mensal"));
    const [vencContrato, setVencContrato] = useState(() => calcVencContrato(vencAtual, "mensal", vencContasAtual));
    const [vencContas, setVencContas] = useState(() => calcVencContas(vencContasAtual));
    const [vencContratoEditado, setVencContratoEditado] = useState(false);

    function handlePeriodoChange(p: Periodo) {
        setPeriodo(p);
        setValor(valorDoPeriodo(p));
        if (!vencContratoEditado) {
            setVencContrato(calcVencContrato(vencAtual, p, vencContasAtual));
        }
    }

    function handleOpen() {
        setPeriodo("mensal");
        setValor(valorDoPeriodo("mensal"));
        setVencContrato(calcVencContrato(vencAtual, "mensal", vencContasAtual));
        setVencContas(calcVencContas(vencContasAtual));
        setVencContratoEditado(false);
        setStatusFinal("ativo");
        setOpen(true);
    }

    async function executarPendente() {
        if (!valor.trim()) { alert("Informe o valor do pagamento."); return; }
        setLoading(true);

        const resp = await fetch(`/api/assinaturas/${idAssinatura}/renovar`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                soPagamento: true,
                registrarPagamento: true,
                statusFinal: "ativo",
                pagamento: { idCliente, nomeCliente, pacoteNome, forma, valor },
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

    async function executar(registrarPagamento: boolean) {
        if (!idAssinatura) { alert("ID da assinatura inválido."); return; }
        if (registrarPagamento && statusFinal === "ativo" && !valor.trim()) {
            alert("Informe o valor do pagamento.");
            return;
        }

        setLoading(true);

        const resp = await fetch(`/api/assinaturas/${idAssinatura}/renovar`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                periodo,
                dataManual: vencContrato,
                vencContasManual: vencContas,
                statusFinal: registrarPagamento ? statusFinal : null, // null = manter status ao clicar "Alterar"
                registrarPagamento: registrarPagamento && statusFinal === "ativo",
                pagamento: (registrarPagamento && statusFinal === "ativo")
                    ? { idCliente, nomeCliente, pacoteNome, forma, valor }
                    : null,
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
    const labelClass = "text-xs font-semibold text-zinc-700";

    return (
        <>
            <button
                type="button"
                onClick={handleOpen}
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
                                {vencAtual ? ` • vencimento atual: ${vencAtual.split("T")[0].split("-").reverse().join("/")}` : ""}
                            </p>
                            {isPendente && (
                                <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                                    Assinatura pendente — o pagamento ativará a assinatura sem alterar as datas.
                                </div>
                            )}
                        </div>

                        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

                            {/* Modo normal: mostra período e datas */}
                            {!isPendente && (
                                <>
                                    <div className="space-y-1.5">
                                        <label className={labelClass}>Periodo</label>
                                        <select className={inputClass} value={periodo} onChange={(e) => handlePeriodoChange(e.target.value as Periodo)}>
                                            <option value="mensal">Mensal (1 mes)</option>
                                            <option value="trimestral">Trimestral (3 meses)</option>
                                            <option value="semestral">Semestral (6 meses)</option>
                                            <option value="anual">Anual (12 meses)</option>
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <label className={labelClass}>Venc. contrato</label>
                                            <input
                                                type="date"
                                                className={inputClass}
                                                value={vencContrato}
                                                onChange={(e) => {
                                                    setVencContrato(e.target.value);
                                                    setVencContratoEditado(true);
                                                }}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className={labelClass}>Venc. contas</label>
                                            <input
                                                type="date"
                                                className={inputClass}
                                                value={vencContas}
                                                onChange={(e) => setVencContas(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <p className="text-xs text-zinc-400">
                                        Datas calculadas automaticamente pelo periodo. Edite se necessario.
                                    </p>

                                    {/* Seleção de status */}
                                    <div className="space-y-1.5">
                                        <label className={labelClass}>Marcar status como</label>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => setStatusFinal("ativo")}
                                                className={`flex-1 h-9 rounded-xl border text-sm font-medium transition-colors ${
                                                    statusFinal === "ativo"
                                                        ? "bg-emerald-600 border-emerald-600 text-white"
                                                        : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-400"
                                                }`}
                                            >
                                                ✓ Ativo
                                                {statusFinal === "ativo" && <span className="ml-1.5 text-xs opacity-75">(padrão)</span>}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setStatusFinal("pendente")}
                                                className={`flex-1 h-9 rounded-xl border text-sm font-medium transition-colors ${
                                                    statusFinal === "pendente"
                                                        ? "bg-amber-500 border-amber-500 text-white"
                                                        : "bg-white border-zinc-200 text-zinc-600 hover:border-zinc-400"
                                                }`}
                                            >
                                                ⏳ Pendente
                                            </button>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Datas somente leitura para pendente */}
                            {isPendente && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className={labelClass}>Venc. contrato atual</label>
                                        <input
                                            type="date"
                                            className={`${inputClass} bg-zinc-50 text-zinc-400 cursor-not-allowed`}
                                            value={vencAtual?.split("T")[0] ?? ""}
                                            readOnly
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className={labelClass}>Venc. contas atual</label>
                                        <input
                                            type="date"
                                            className={`${inputClass} bg-zinc-50 text-zinc-400 cursor-not-allowed`}
                                            value={vencContasAtual?.split("T")[0] ?? ""}
                                            readOnly
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Pagamento — visível somente se status = ativo */}
                            {(isPendente || statusFinal === "ativo") && (
                                <div className={isPendente ? "" : "border-t pt-4"}>
                                    {!isPendente && (
                                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">Dados do pagamento</p>
                                    )}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <label className={labelClass}>Forma</label>
                                            <select className={inputClass} value={forma} onChange={(e) => setForma(e.target.value)}>
                                                {FORMAS_PGTO.map((f) => <option key={f} value={f}>{f}</option>)}
                                            </select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className={labelClass}>Valor (R$)</label>
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
                            )}

                            {/* Aviso quando pendente selecionado */}
                            {!isPendente && statusFinal === "pendente" && (
                                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                                    As datas serão atualizadas normalmente, mas nenhum pagamento será registrado e o status ficará como <b>pendente</b>.
                                </div>
                            )}
                        </div>

                        <div className="px-6 py-4 border-t flex justify-end gap-2">
                            <button type="button" onClick={() => setOpen(false)} disabled={loading}
                                className="h-9 rounded-xl border px-4 text-sm hover:bg-zinc-50 disabled:opacity-50">
                                Cancelar
                            </button>

                            {isPendente ? (
                                <button type="button" onClick={executarPendente} disabled={loading}
                                    className="h-9 rounded-xl bg-emerald-600 px-4 text-sm text-white font-medium hover:bg-emerald-700 disabled:opacity-50">
                                    {loading ? "Salvando..." : "Confirmar pagamento"}
                                </button>
                            ) : (
                                <>
                                    <button type="button" onClick={() => executar(false)} disabled={loading}
                                        className="h-9 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50">
                                        {loading ? "..." : "Alterar"}
                                    </button>
                                    <button type="button" onClick={() => executar(true)} disabled={loading}
                                        className={`h-9 rounded-xl px-4 text-sm text-white font-medium disabled:opacity-50 transition-colors ${
                                            statusFinal === "pendente"
                                                ? "bg-amber-500 hover:bg-amber-600"
                                                : "bg-emerald-600 hover:bg-emerald-700"
                                        }`}>
                                        {loading ? "Salvando..." : statusFinal === "pendente" ? "Salvar como pendente" : "Renovar"}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}