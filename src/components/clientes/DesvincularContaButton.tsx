"use client";

import { useState, useTransition } from "react";
import { desvincularconta } from "@/app/actions/contasVinculo";

type Props = { idConta: string; idCliente: string; usuario: string };

export default function DesvincularContaButton({ idConta, idCliente, usuario }: Props) {
  const [confirmando, setConfirmando] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirmar() {
    startTransition(async () => {
      await desvincularconta(idConta, idCliente);
      setConfirmando(false);
    });
  }

  if (confirmando) {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          onClick={confirmar}
          disabled={pending}
          className="rounded px-1.5 py-0.5 text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
        >
          {pending ? "…" : "Confirmar"}
        </button>
        <button
          onClick={() => setConfirmando(false)}
          className="rounded px-1.5 py-0.5 text-xs text-zinc-400 hover:text-zinc-600"
        >
          Cancelar
        </button>
      </span>
    );
  }

  return (
    <button
      onClick={() => setConfirmando(true)}
      title={`Desvincular ${usuario}`}
      className="ml-1 rounded-full w-4 h-4 flex items-center justify-center text-zinc-300 hover:bg-red-100 hover:text-red-500 transition-colors leading-none"
    >
      ×
    </button>
  );
}
