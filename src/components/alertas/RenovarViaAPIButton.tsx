"use client";
import { useState } from "react";

type Props = {
    idPainelServidor: number | null;
    usuario: string;
    onRenovado?: (novoVencimento: string) => void;
};

export default function RenovarViaAPIButton({ idPainelServidor, usuario, onRenovado }: Props) {
    const [estado, setEstado] = useState<"idle" | "loading" | "ok" | "erro">("idle");
    const [mensagem, setMensagem] = useState<string | null>(null);
    const [novaData, setNovaData] = useState<string | null>(null);

    const semPainel = idPainelServidor === null;

    async function renovar() {
        if (semPainel || estado === "loading") return;
        setEstado("loading");
        setMensagem(null);
        try {
            const res = await fetch(`/api/paineis/servidores/${idPainelServidor}/renovar`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ usuario }),
            });
            const text = await res.text();
            let json: any;
            try { json = JSON.parse(text); } catch { throw new Error(`HTTP ${res.status} — ${text.slice(0, 150)}`); }
            if (!res.ok || json.erro) {
                setEstado("erro");
                setMensagem(json.erro ?? `Erro ${res.status}.`);
            } else {
                setEstado("ok");
                setMensagem(json.mensagem ?? "Renovado!");
                if (json.novoVencimento) {
                    setNovaData(json.novoVencimento.split("-").reverse().join("/"));
                    onRenovado?.(json.novoVencimento);
                }
            }
        } catch (e: unknown) {
            setEstado("erro");
            setMensagem(e instanceof Error ? e.message : "Erro de rede.");
        }
    }

    if (estado === "ok") {
        return (
            <div className="flex flex-col gap-0.5">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg">
                    ✓ Renovado
                    {novaData && <span className="opacity-75">→ {novaData}</span>}
                </span>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-1">
            <button
                onClick={renovar}
                disabled={semPainel || estado === "loading"}
                title={semPainel ? "Conta sem painel configurado" : `Renovar ${usuario} via API`}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors
                    ${semPainel
                        ? "cursor-not-allowed bg-zinc-100 text-zinc-400"
                        : estado === "loading"
                            ? "cursor-wait bg-blue-100 text-blue-500"
                            : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}
            >
                {estado === "loading" ? (
                    <><span className="animate-spin">⟳</span> Renovando…</>
                ) : (
                    <>⟳ Renovar via API</>
                )}
            </button>
            {estado === "erro" && mensagem && (
                <p className="text-xs text-red-600">{mensagem}</p>
            )}
        </div>
    );
}
