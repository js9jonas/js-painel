"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Periodo = "mensal" | "trimestral" | "semestral" | "anual";

export default function RenovarAssinatura({
    idAssinatura,
    vencAtual,
}: {
    idAssinatura: string;
    vencAtual?: string | null;
}) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [periodo, setPeriodo] = useState<Periodo>("mensal");
    const [dataManual, setDataManual] = useState("");
    const [ativar, setAtivar] = useState(true);
    const [loading, setLoading] = useState(false);

    async function confirmar() {
        if (!idAssinatura) {
            alert("ID da assinatura inválido.");
            return;
        }

        setLoading(true);

        const resp = await fetch(`/api/assinaturas/${idAssinatura}/renovar`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                periodo,
                dataManual: dataManual.trim() ? dataManual : null,
                ativar,
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="w-full max-w-md rounded-2xl bg-white p-6 space-y-4">
                        <div>
                            <h2 className="text-lg font-semibold">Renovar assinatura</h2>
                            <p className="mt-1 text-xs text-zinc-500">
                                Assinatura #{idAssinatura} {vencAtual ? `• vencimento atual: ${vencAtual}` : ""}
                            </p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-700">Período</label>
                            <select
                                className="h-9 w-full rounded-xl border bg-white px-3 text-sm"
                                value={periodo}
                                onChange={(e) => setPeriodo(e.target.value as Periodo)}
                            >
                                <option value="mensal">Mensal (1 mês)</option>
                                <option value="trimestral">Trimestral (3 meses)</option>
                                <option value="semestral">Semestral (6 meses)</option>
                                <option value="anual">Anual (12 meses)</option>
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-700">
                                Ou definir data manual (prioridade)
                            </label>
                            <input
                                type="date"
                                className="h-9 w-full rounded-xl border bg-white px-3 text-sm"
                                value={dataManual}
                                onChange={(e) => setDataManual(e.target.value)}
                            />
                            <p className="text-xs text-zinc-500">
                                Se preencher a data manual, ela será usada no lugar do período.
                            </p>
                        </div>

                        <label className="flex items-center gap-2 text-sm text-zinc-700">
                            <input
                                type="checkbox"
                                checked={ativar}
                                onChange={(e) => setAtivar(e.target.checked)}
                            />
                            Marcar status como <b>ativo</b>
                        </label>

                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="h-9 rounded-xl border px-4 text-sm hover:bg-zinc-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={confirmar}
                                disabled={loading}
                                className="h-9 rounded-xl bg-emerald-600 px-4 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                                {loading ? "Salvando..." : "Confirmar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
