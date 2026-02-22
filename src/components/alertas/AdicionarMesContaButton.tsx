// src/components/alertas/AdicionarMesContaButton.tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { adicionarMesConta } from "@/app/actions/renovarConta";

export default function AdicionarMesContaButton({ idAssinatura }: { idAssinatura: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      await adicionarMesConta(idAssinatura);
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="h-7 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
    >
      {isPending ? "..." : "+1 mês"}
    </button>
  );
}