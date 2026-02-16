"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import EditObservacaoModal from "./EditObservacaoModal";

type Props = {
  idCliente: string;
  telefone?: string | null;
  observacao?: string | null;
};

export default function RowActions({ idCliente, telefone, observacao }: Props) {
  const [editObs, setEditObs] = useState(false);
  const router = useRouter();

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setEditObs(true)}
          className="h-8 rounded-lg border bg-white px-3 text-xs font-medium hover:bg-zinc-50 transition-colors"
          title="Editar observação"
        >
          Editar
        </button>

        <a
          href={`/clientes/${idCliente}`}
          className="h-8 rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 inline-flex items-center transition-colors"
          title="Ver detalhes"
        >
          Ver detalhes
        </a>
      </div>

      {editObs && (
        <EditObservacaoModal
          idCliente={idCliente}
          observacaoAtual={observacao ?? null}
          onClose={() => setEditObs(false)}
          onSaved={() => router.refresh()}
        />
      )}
    </>
  );
}