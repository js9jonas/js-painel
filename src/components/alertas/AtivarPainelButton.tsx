"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Ativa no painel do app (Fun Play / Lazer Play / Core Player) um aparelho cadastrado sem ativação,
// ou renova (mesma ativação de 1 ano) um que está vencendo — `renovar` só muda os textos.
// GASTA 1 CRÉDITO: 1º clique recarrega a tela e pede confirmação com o nome do cliente; 2º clique ativa.
// O servidor ainda recusa gastar de novo se o painel já mostrar o aparelho ativado.

type Estado = "parado" | "confirmar" | "ativando" | "ok" | "erro";

export default function AtivarPainelButton({
  idAppRegistro,
  nomeCliente,
  renovar = false,
}: {
  idAppRegistro: string;
  nomeCliente: string;
  renovar?: boolean;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>("parado");
  const [mensagem, setMensagem] = useState<string | null>(null);
  const prazo = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (prazo.current) clearTimeout(prazo.current); }, []);

  async function acompanhar(jobId: string) {
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const job = await fetch(`/api/aplicativos/${idAppRegistro}/ativar-painel?jobId=${encodeURIComponent(jobId)}`)
        .then((r) => r.json())
        .catch(() => null);
      if (!job?.done) continue;
      if (job.ok) {
        const data = job.validade ? job.validade.split("-").reverse().join("/") : null;
        setEstado("ok");
        setMensagem(
          job.jaAtivado
            ? `Já estava ${renovar ? "renovado" : "ativado"}${data ? ` até ${data}` : ""}. Nenhum crédito gasto.`
            : `${renovar ? "Renovado" : "Ativado"}${data ? ` até ${data}` : ""}.`
        );
        router.refresh();
      } else {
        setEstado("erro");
        setMensagem(job.erro ?? "Não deu pra ativar.");
      }
      return;
    }
    setEstado("erro");
    setMensagem("O painel demorou para responder. Confira o aparelho no painel antes de tentar de novo.");
  }

  async function clicar() {
    if (estado === "ativando") return;
    if (estado !== "confirmar") {
      setMensagem(null);
      setEstado("confirmar");
      router.refresh();
      if (prazo.current) clearTimeout(prazo.current);
      prazo.current = setTimeout(() => setEstado((e) => (e === "confirmar" ? "parado" : e)), 8000);
      return;
    }
    if (prazo.current) clearTimeout(prazo.current);
    setEstado("ativando");
    try {
      const res = await fetch(`/api/aplicativos/${idAppRegistro}/ativar-painel`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.jobId) throw new Error(data.erro ?? `Não deu pra iniciar a ${renovar ? "renovação" : "ativação"}.`);
      await acompanhar(data.jobId);
    } catch (e: unknown) {
      setEstado("erro");
      setMensagem(e instanceof Error ? e.message : "Sem internet ou o sistema está atualizando. Tente de novo.");
    }
  }

  if (estado === "ok") {
    return <span className="text-xs font-medium text-green-700">{mensagem}</span>;
  }

  return (
    <div className="flex flex-col gap-1 max-w-56">
      <button
        onClick={clicar}
        disabled={estado === "ativando"}
        className={`h-7 rounded-lg px-3 text-xs font-medium text-white transition-colors disabled:opacity-60 ${
          estado === "confirmar" ? "bg-red-600 hover:bg-red-700" : "bg-violet-600 hover:bg-violet-700"
        }`}
      >
        {estado === "ativando"
          ? renovar ? "Renovando…" : "Ativando…"
          : estado === "confirmar"
            ? "Confirmar: gasta 1 crédito"
            : renovar ? "Renovar no painel" : "Ativar no painel"}
      </button>
      {estado === "confirmar" && (
        <span className="text-xs text-zinc-500">
          {renovar ? "Renovar por 1 ano" : "Ativar"} o aparelho de {nomeCliente}? Clique de novo para confirmar.
        </span>
      )}
      {estado === "erro" && mensagem && <span className="text-xs text-red-600">{mensagem}</span>}
    </div>
  );
}
