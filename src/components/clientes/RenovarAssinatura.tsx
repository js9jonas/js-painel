"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Periodo = "mensal" | "trimestral" | "semestral" | "anual";
type StatusFinal = "ativo" | "pendente";

type ContaVinculada = {
    id_painel_servidor: number | null;
    usuario: string;
    vencimento_real_painel: string | null;
    nome_painel: string;
};

type ResultadoConta = {
    usuario: string;
    nome_painel: string;
    ok: boolean;
    mensagem: string;
    novoVencimento?: string | null;
};

const FORMAS_PGTO = ["PIX", "Nu PJ", "Nubank", "Lotérica", "Cortesia", "Dinheiro", "Sicredi", "Caixa", "Banrisul", "Outro"];
const MESES: Record<Periodo, number> = { mensal: 1, trimestral: 3, semestral: 6, anual: 12 };

function hojeStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addMeses(dataStr: string | null | undefined, meses: number): string {
    const base = new Date((dataStr ?? hojeStr()) + "T00:00:00");
    base.setMonth(base.getMonth() + meses);
    return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
}

function calcVencContrato(
    vencAtual: string | null | undefined,
    periodo: Periodo,
): string {
    return addMeses(vencAtual ?? undefined, MESES[periodo]);
}

function vencContasVencida(vencContasAtual: string | null | undefined): boolean {
    if (!vencContasAtual) return false;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const venc = new Date(vencContasAtual.split("T")[0] + "T00:00:00");
    return venc <= hoje;
}

function contasExpiradas(contas: ContaVinculada[]): ContaVinculada[] {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return contas.filter(c => {
        if (!c.vencimento_real_painel || c.id_painel_servidor === null) return false;
        return new Date(c.vencimento_real_painel.split("T")[0] + "T00:00:00") <= hoje;
    });
}

async function renovarContasViaAPI(contas: ContaVinculada[]): Promise<ResultadoConta[]> {
    return Promise.all(
        contas.map(async (c) => {
            try {
                const res = await fetch(`/api/paineis/servidores/${c.id_painel_servidor}/renovar`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ usuario: c.usuario }),
                });
                const json = await res.json();
                if (!res.ok || json.erro) {
                    return { usuario: c.usuario, nome_painel: c.nome_painel, ok: false, mensagem: json.erro ?? "Erro ao renovar." };
                }
                return {
                    usuario: c.usuario,
                    nome_painel: c.nome_painel,
                    ok: true,
                    mensagem: json.mensagem ?? "Renovado!",
                    novoVencimento: json.novoVencimento ?? null,
                };
            } catch {
                return { usuario: c.usuario, nome_painel: c.nome_painel, ok: false, mensagem: "Erro de rede." };
            }
        })
    );
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
    contasVinculadas,
    onSuccess,
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
    contasVinculadas?: ContaVinculada[];
    onSuccess?: () => void;
}) {
    const router = useRouter();
    const isPendente = (status ?? "").toLowerCase().trim() === "pendente";
    const contasVencida = vencContasVencida(vencContasAtual);

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
    const [vencContrato, setVencContrato] = useState(() => calcVencContrato(contasVencida ? null : vencAtual, "mensal"));
    const [vencContas, setVencContas] = useState(() =>
        contasVencida
            ? addMeses(undefined, 1)
            : (vencContasAtual?.split("T")[0] ?? "")
    );
    const [vencContratoEditado, setVencContratoEditado] = useState(false);
    const [resultadosContas, setResultadosContas] = useState<ResultadoConta[]>([]);

    function handlePeriodoChange(p: Periodo) {
        setPeriodo(p);
        setValor(valorDoPeriodo(p));
        if (!vencContratoEditado) {
            setVencContrato(calcVencContrato(contasVencida ? null : vencAtual, p));
        }
    }

    function handleOpen() {
        setPeriodo("mensal");
        setValor(valorDoPeriodo("mensal"));
        setVencContrato(calcVencContrato(contasVencida ? null : vencAtual, "mensal"));
        setVencContratoEditado(false);
        setVencContas(contasVencida ? addMeses(undefined, 1) : (vencContasAtual?.split("T")[0] ?? ""));
        setStatusFinal("ativo");
        setResultadosContas([]);
        setOpen(true);
    }

    function fecharComRefresh() {
        setOpen(false);
        router.refresh();
        onSuccess?.();
        setResultadosContas([]);
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

        if (j?.whatsapp?.enviado === false) {
            alert(`Assinatura renovada. Mensagem de confirmação não enviada: ${j.whatsapp.motivo}`);
        }

        setOpen(false);
        router.refresh();
        onSuccess?.();
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
                vencContasManual: vencContas || null,
                statusFinal: registrarPagamento ? statusFinal : null,
                registrarPagamento: registrarPagamento && statusFinal === "ativo",
                pagamento: (registrarPagamento && statusFinal === "ativo")
                    ? { idCliente, nomeCliente, pacoteNome, forma, valor }
                    : null,
            }),
        });

        const text = await resp.text();
        let j: any = {};
        try { j = JSON.parse(text); } catch { }

        if (!resp.ok || j?.ok === false) {
            setLoading(false);
            alert(j?.error ?? text ?? `Erro HTTP ${resp.status}`);
            return;
        }

        if (j?.whatsapp?.enviado === false) {
            alert(`Assinatura renovada. Mensagem de confirmação não enviada: ${j.whatsapp.motivo}`);
        }

        const expiradas = contasExpiradas(contasVinculadas ?? []);

        if (expiradas.length === 0) {
            setLoading(false);
            setOpen(false);
            router.refresh();
            onSuccess?.();
            return;
        }

        const resultados = await renovarContasViaAPI(expiradas);
        setLoading(false);
        setResultadosContas(resultados);
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
                    <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh] overflow-x-hidden">

                        <div className="px-4 pt-5 pb-4 border-b sm:px-6 sm:pt-6">
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

                        {/* Resultados da renovação via API */}
                        {resultadosContas.length > 0 ? (
                            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                                <p className="text-sm font-semibold text-emerald-700">✓ Assinatura salva</p>
                                <p className="text-xs text-zinc-500 -mt-1">Resultado da renovação das contas no painel:</p>
                                <div className="space-y-2">
                                    {resultadosContas.map((r, i) => (
                                        <div key={i} className={`rounded-xl px-3 py-2.5 text-xs border ${r.ok ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-medium text-zinc-800">
                                                    {r.nome_painel} · <span className="font-mono">{r.usuario}</span>
                                                </span>
                                                <span className={`font-semibold ${r.ok ? "text-emerald-700" : "text-red-600"}`}>
                                                    {r.ok ? "✓ Renovado" : "✗ Erro"}
                                                </span>
                                            </div>
                                            <div className={`mt-0.5 ${r.ok ? "text-emerald-600" : "text-red-500"}`}>
                                                {r.ok && r.novoVencimento
                                                    ? `Novo vencimento: ${r.novoVencimento.split("-").reverse().join("/")}`
                                                    : r.mensagem}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 sm:px-6">

                                {/* Modo normal: mostra período e datas */}
                                {!isPendente && (
                                    <>
                                        {/* Alerta de urgência em venc_contas */}
                                        {contasVencida && (
                                            <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-3">
                                                <span className="text-red-500 text-base mt-0.5">⚠️</span>
                                                <div>
                                                    <p className="text-sm font-semibold text-red-800">Renovação urgente necessária</p>
                                                    <p className="text-xs text-red-600 mt-0.5">
                                                        O vencimento de contas (
                                                        <span className="font-medium">
                                                            {vencContasAtual!.split("T")[0].split("-").reverse().join("/")}
                                                        </span>
                                                        ) já passou. A conta no painel será renovada automaticamente ao salvar.
                                                    </p>
                                                </div>
                                            </div>
                                        )}

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
                                                <label className={`${labelClass} flex items-center gap-1.5`}>
                                                    Venc. contas
                                                    <span className={`text-xs font-normal px-1.5 py-0.5 rounded-md ${contasVencida
                                                            ? "bg-red-100 text-red-600"
                                                            : "bg-zinc-100 text-zinc-400"
                                                        }`}>
                                                        {contasVencida ? "⚠️ vencida" : "não alterada"}
                                                    </span>
                                                </label>
                                                <input
                                                    type="date"
                                                    className={`${inputClass} ${contasVencida ? "border-red-300 focus:ring-red-400" : ""}`}
                                                    value={vencContas}
                                                    onChange={(e) => setVencContas(e.target.value)}
                                                />
                                            </div>
                                        </div>

                                        {/* Seleção de status */}
                                        <div className="space-y-1.5">
                                            <label className={labelClass}>Marcar status como</label>
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setStatusFinal("ativo")}
                                                    className={`flex-1 h-9 rounded-xl border text-sm font-medium transition-colors ${statusFinal === "ativo"
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
                                                    className={`flex-1 h-9 rounded-xl border text-sm font-medium transition-colors ${statusFinal === "pendente"
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
                        )}

                        <div className="px-4 py-4 border-t flex flex-wrap justify-end gap-2 sm:px-6">
                            {resultadosContas.length > 0 ? (
                                <button type="button" onClick={fecharComRefresh}
                                    className="h-9 rounded-xl bg-zinc-900 px-4 text-sm text-white font-medium hover:bg-zinc-800">
                                    Fechar
                                </button>
                            ) : isPendente ? (
                                <>
                                    <button type="button" onClick={() => setOpen(false)} disabled={loading}
                                        className="h-9 rounded-xl border px-4 text-sm hover:bg-zinc-50 disabled:opacity-50">
                                        Cancelar
                                    </button>
                                    <button type="button" onClick={executarPendente} disabled={loading}
                                        className="h-9 rounded-xl bg-emerald-600 px-4 text-sm text-white font-medium hover:bg-emerald-700 disabled:opacity-50">
                                        {loading ? "Salvando..." : "Confirmar pagamento"}
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button type="button" onClick={() => setOpen(false)} disabled={loading}
                                        className="h-9 rounded-xl border px-4 text-sm hover:bg-zinc-50 disabled:opacity-50">
                                        Cancelar
                                    </button>
                                    <button type="button" onClick={() => executar(false)} disabled={loading}
                                        className="h-9 rounded-xl border border-zinc-300 bg-white px-4 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50">
                                        {loading ? "..." : "Alterar"}
                                    </button>
                                    <button type="button" onClick={() => executar(true)} disabled={loading}
                                        className={`h-9 rounded-xl px-4 text-sm text-white font-medium disabled:opacity-50 transition-colors ${statusFinal === "pendente"
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
