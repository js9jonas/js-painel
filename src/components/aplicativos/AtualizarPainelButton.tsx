"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, RefreshCw } from "lucide-react";

// Atualiza só este aparelho a partir do painel do app (validade + vínculo com o painel), sem rodar o
// sync inteiro. Não gasta crédito: só consulta. Ver /api/aplicativos/[id]/atualizar-painel.

const br = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "sem validade");

export default function AtualizarPainelButton({ idAppRegistro, onAtualizado }: {
  idAppRegistro: string;
  /** Telas que buscam os dados por conta própria (sem router.refresh) recarregam aqui. */
  onAtualizado?: () => void;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<"parado" | "buscando" | "ok" | "erro">("parado");
  const [msg, setMsg] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  async function atualizar() {
    setEstado("buscando");
    setMsg("");
    try {
      const res = await fetch(`/api/aplicativos/${idAppRegistro}/atualizar-painel`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.jobId) throw new Error(data.erro ?? "Não deu pra consultar o painel.");
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const job = await fetch(`/api/aplicativos/${idAppRegistro}/atualizar-painel?jobId=${encodeURIComponent(data.jobId)}`)
          .then((r) => r.json())
          .catch(() => null);
        if (!job?.done) continue;
        if (!job.ok) throw new Error(job.erro ?? "Não deu pra consultar o painel.");
        setEstado("ok");
        setMsg(job.mudou ? `Atualizado: até ${br(job.validade)}` : `Já estava em dia (${br(job.validade)})`);
        setAviso(job.aviso ?? null);
        router.refresh(); // listas (IBO/Clouddy) podem mudar mesmo com a validade igual
        onAtualizado?.();
        return;
      }
      throw new Error("O painel demorou para responder. Tente de novo.");
    } catch (e: unknown) {
      setEstado("erro");
      setMsg(e instanceof Error ? e.message : "Sem internet ou o sistema está atualizando. Tente de novo.");
    }
  }

  // Deu certo: o botão some e fica só o aviso (os dados novos já estão na tela). Erro: botão fica pra tentar de novo.
  if (estado === "ok") {
    return (
      <span className="inline-flex flex-col items-start">
        <span className="inline-flex h-7 items-center gap-1 text-xs text-emerald-700" title={msg}>
          <Check className="w-3.5 h-3.5" /> Atualizado
        </span>
        {/* IBO Pro: validade ok, mas as listas não vieram (ex.: limite diário de login do site do cliente) */}
        {aviso && <span className="max-w-56 text-xs text-amber-700">{aviso}</span>}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={() => void atualizar()}
        disabled={estado === "buscando"}
        title="Buscar só este aparelho no painel e copiar a validade (não gasta crédito)"
        className="inline-flex h-7 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${estado === "buscando" ? "animate-spin" : ""}`} />
        {estado === "buscando" ? "Buscando…" : "Atualizar"}
      </button>
      {estado === "erro" && msg && <span className="text-xs text-red-600">{msg}</span>}
    </div>
  );
}
