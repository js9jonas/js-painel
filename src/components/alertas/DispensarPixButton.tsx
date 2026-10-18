// src/components/alertas/DispensarPixButton.tsx
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { dispensarPixLink } from "@/app/actions/pixLink";

export default function DispensarPixButton({ idCobranca, idAssinatura }: { idCobranca: string; idAssinatura: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    if (!confirm("Tirar este Pix da lista sem renovar? (ex.: já renovado por comprovante, ou devolvido)")) return;
    startTransition(async () => {
      const r = await dispensarPixLink(idCobranca, idAssinatura);
      if (!r.ok) alert(r.error);
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="h-7 rounded-lg border border-zinc-300 px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 transition-colors"
    >
      {isPending ? "..." : "Dispensar"}
    </button>
  );
}
