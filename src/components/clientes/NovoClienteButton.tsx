// src/components/clientes/NovoClienteButton.tsx
"use client";

import { useState } from "react";
import NovoClienteModal from "./NovoClienteModal";
import type { PlanoRow } from "@/lib/planos";
import type { PacoteRow } from "@/lib/pacotes";

type Props = {
  planos: PlanoRow[];
  pacotes: PacoteRow[];
};

export default function NovoClienteButton({ planos, pacotes }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-10 rounded-xl bg-zinc-900 px-5 text-sm font-medium text-white hover:bg-zinc-800 transition-all shadow-sm"
      >
        + Novo cliente
      </button>

      {open && (
        <NovoClienteModal
          planos={planos}
          pacotes={pacotes}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
