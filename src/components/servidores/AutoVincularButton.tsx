"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { autoVincularSugeridos } from "@/app/actions/vincularConta";

export default function AutoVincularButton({ total }: { total: number }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    if (!confirm(`Vincular automaticamente ${total} conta${total !== 1 ? "s" : ""} com cliente de nome idêntico ao rótulo?`)) return;
    startTransition(async () => {
      const { vinculados } = await autoVincularSugeridos();
      alert(`${vinculados} conta${vinculados !== 1 ? "s" : ""} vinculada${vinculados !== 1 ? "s" : ""} com sucesso.`);
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-3 shadow-sm text-left hover:bg-blue-100 transition-colors disabled:opacity-50"
    >
      <p className="text-xs text-blue-600">Sugestões automáticas</p>
      <p className="text-2xl font-bold text-blue-700">{total}</p>
      <p className="text-xs text-blue-500 mt-0.5">{isPending ? "Vinculando..." : "Clique para vincular todas"}</p>
    </button>
  );
}
