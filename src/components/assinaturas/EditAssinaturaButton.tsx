// src/components/assinaturas/EditAssinaturaButton.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import EditAssinaturaModal from "./EditAssinaturaModal";
import type { PlanoRow } from "@/lib/planos";
import type { PacoteRow } from "@/lib/pacotes";

type AssinaturaData = {
  id_assinatura: string;
  id_plano: string | null;
  id_pacote: string | null;
  venc_contrato: string | null;
  venc_contas: string | null;
  status: string | null;
  identificacao: string | null;
  observacao: string | null;
};

type Props = {
  idCliente: string;
  assinatura: AssinaturaData;
  planos: PlanoRow[];
  pacotes: PacoteRow[];
};

export default function EditAssinaturaButton({
  idCliente,
  assinatura,
  planos,
  pacotes,
}: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-8 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium hover:bg-zinc-50 transition-colors"
      >
        ✏️ Editar
      </button>

      {open && (
        <EditAssinaturaModal
          idCliente={idCliente}
          assinatura={assinatura}
          planos={planos}
          pacotes={pacotes}
          onClose={() => setOpen(false)}
          onSaved={() => router.refresh()}
        />
      )}
    </>
  );
}
