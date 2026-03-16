// src/components/clientes/RowActions.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import EditClienteModal from "./EditClienteModal";

type Props = {
  idCliente: string;
  nome: string;
  telefone?: string | null;
  observacao?: string | null;
  observacaoAssinatura?: string | null;
  idAssinaturaPrincipal?: string | null;
};

export default function RowActions({
  idCliente,
  nome,
  telefone,
  observacao,
  observacaoAssinatura,
  idAssinaturaPrincipal,
}: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const router = useRouter();

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="h-8 rounded-lg border border-zinc-300 bg-white px-3 text-xs font-medium hover:bg-zinc-50 transition-colors"
          title="Editar cliente"
        >
          ✏️ Editar
        </button>
      </div>

      {editOpen && (
        <EditClienteModal
          idCliente={idCliente}
          nomeAtual={nome}
          observacaoAtual={observacao ?? null}
          observacaoAssinaturaAtual={observacaoAssinatura ?? null}
          idAssinaturaPrincipal={idAssinaturaPrincipal ?? null}
          onClose={() => setEditOpen(false)}
          onSaved={() => router.refresh()}
        />
      )}
    </>
  );
}