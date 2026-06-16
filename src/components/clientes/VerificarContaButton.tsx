"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ContaAtualizada = { id_conta: number; vencimento: string | null; status: string };

type Props = {
  idConta: string;
  usuario: string;
  /** Forçado externamente — ex.: outra conta da mesma assinatura/painel já verificou por esta. */
  verificado?: boolean;
  onVerificado?: (atualizados: ContaAtualizada[]) => void;
};

export default function VerificarContaButton({ idConta, usuario, verificado, onVerificado }: Props) {
  const [estado, setEstado] = useState<"idle" | "verificando" | "ok" | "erro">("idle");
  const [erro, setErro] = useState<string | null>(null);
  const router = useRouter();

  async function verificar() {
    setEstado("verificando");
    setErro(null);
    try {
      const startRes = await fetch(`/api/contas/${idConta}/verificar`, { method: "POST" });
      const { jobId } = await startRes.json();
      if (!jobId) {
        setEstado("erro");
        setErro("Erro ao iniciar verificação.");
        return;
      }

      const inicio = Date.now();
      const MAX_ESPERA = 10 * 60 * 1000; // captcha pesado (CLUB) pode levar minutos
      while (Date.now() - inicio < MAX_ESPERA) {
        await new Promise((r) => setTimeout(r, 3000));
        const poll = await fetch(`/api/contas/${idConta}/verificar?jobId=${jobId}`);
        const job = await poll.json();
        if (job.done) {
          if (job.ok) {
            setEstado("ok");
            onVerificado?.(job.atualizados);
            router.refresh();
          } else {
            setEstado("erro");
            setErro(job.erro ?? "Falha ao verificar.");
          }
          return;
        }
      }
      setEstado("erro");
      setErro("Timeout: verificação não concluiu a tempo.");
    } catch {
      setEstado("erro");
      setErro("Erro de rede.");
    }
  }

  if (estado === "ok" || verificado) {
    return (
      <span title="Verificado agora via API" className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        onClick={verificar}
        disabled={estado === "verificando"}
        title={`Verificar ${usuario} agora no painel`}
        className="ml-1 rounded-full w-4 h-4 flex items-center justify-center text-zinc-300 hover:bg-blue-100 hover:text-blue-500 transition-colors leading-none disabled:opacity-50"
      >
        {estado === "verificando" ? <span className="animate-spin">⟳</span> : "↻"}
      </button>
      {estado === "erro" && erro && (
        <span className="text-[10px] text-red-500" title={erro}>⚠️</span>
      )}
    </span>
  );
}
