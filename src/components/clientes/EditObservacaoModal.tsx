"use client";

import { useState } from "react";

type Props = {
  idCliente: string;
  observacaoAtual: string | null;
  onClose: () => void;
  onSaved: () => void;
};

export default function EditObservacaoModal({
  idCliente,
  observacaoAtual,
  onClose,
  onSaved,
}: Props) {
  const [valor, setValor] = useState(observacaoAtual ?? "");
  const [salvando, setSalvando] = useState(false);

async function salvar() {
  try {
    setSalvando(true);

    const resp = await fetch(`/api/clientes/${idCliente}/observacao`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ observacao: valor }),
    });

    const text = await resp.text();
    let j: any = {};
    try { j = JSON.parse(text); } catch {}

    if (!resp.ok || j?.ok === false) {
      alert(j?.error ?? text ?? `Erro HTTP ${resp.status}`);
      return;
    }

    onSaved();
    onClose();
  } finally {
    setSalvando(false);
  }
}

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 space-y-4">
        <h2 className="text-lg font-semibold">Editar observação</h2>

        <textarea
          className="w-full rounded-xl border px-3 py-2 text-sm min-h-[120px]"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder="Digite a observação do cliente..."
        />

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="h-9 rounded-xl border px-4 text-sm hover:bg-zinc-50"
          >
            Cancelar
          </button>

          <button
            onClick={salvar}
            disabled={salvando}
            className="h-9 rounded-xl bg-zinc-900 px-4 text-sm text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
