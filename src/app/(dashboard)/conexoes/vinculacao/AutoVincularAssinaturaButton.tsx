"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { autoVincularConfiantes } from "@/app/actions/vincularContaAssinatura";

export default function AutoVincularAssinaturaButton({ total }: { total: number }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    if (!confirm(`Vincular automaticamente ${total} conta${total !== 1 ? "s" : ""} com score ≥ 70%?`)) return;
    startTransition(async () => {
      const { vinculados } = await autoVincularConfiantes();
      alert(`${vinculados} conta${vinculados !== 1 ? "s" : ""} vinculada${vinculados !== 1 ? "s" : ""} com sucesso.`);
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-3 shadow-sm text-left hover:bg-emerald-100 transition-colors disabled:opacity-50"
    >
      <p className="text-xs text-emerald-600">Alta confiança (≥ 70%)</p>
      <p className="text-2xl font-bold text-emerald-700">{total}</p>
      <p className="text-xs text-emerald-500 mt-0.5">{isPending ? "Vinculando..." : "Clique para vincular todas"}</p>
    </button>
  );
}
