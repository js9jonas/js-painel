"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteAssinatura } from "@/app/actions/assinaturas";

type Props = { idAssinatura: string; idCliente: string };

export default function DeleteAssinaturaButton({ idAssinatura, idCliente }: Props) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function excluir() {
    if (
      !confirm(
        "Excluir esta assinatura? Só funciona se não houver pagamentos, contas ou aplicativos vinculados. Esta ação não pode ser desfeita."
      )
    )
      return;

    startTransition(async () => {
      const res = await deleteAssinatura(idAssinatura, idCliente);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={excluir}
      disabled={pending}
      className="h-8 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50 transition-colors"
    >
      {pending ? "…" : "🗑️ Excluir"}
    </button>
  );
}
