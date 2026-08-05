"use client";

import { useState } from "react";
import MigrarPainelModal from "./MigrarPainelModal";

type PainelResumo = { id: number; nome: string; tipo: string };
type ContaMinima = { id_conta: string; usuario: string; nome_painel: string | null };

type Props = {
  conta: ContaMinima;
  opcoes: PainelResumo[];
};

/** Botão standalone "Migrar" — usado em telas sem um menu de ações já pronto (ex: /alertas). */
export default function MigrarPainelButton({ conta, opcoes }: Props) {
  const [aberto, setAberto] = useState(false);

  if (opcoes.length === 0) return null;

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        type="button"
        title={`Migrar ${conta.usuario} pra outro painel`}
        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-600 border border-zinc-300 hover:bg-zinc-50 transition-colors"
      >
        🔁 Migrar
      </button>
      {aberto && (
        <MigrarPainelModal
          conta={conta}
          opcoes={opcoes}
          onClose={() => setAberto(false)}
          onMigrado={() => setAberto(false)}
        />
      )}
    </>
  );
}
