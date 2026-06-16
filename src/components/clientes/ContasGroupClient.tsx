"use client";

import { useState, type ReactNode } from "react";
import ContasCards from "./ContasCards";
import VerificarContaButton from "./VerificarContaButton";
import DesvincularContaButton from "./DesvincularContaButton";
import type { ContaPainelVinculada } from "@/lib/clientes";

type ContaAtualizada = { id_conta: number; vencimento: string | null; status: string };

type Props = {
  contas: ContaPainelVinculada[];
  idCliente: string;
  vencContas?: string | null;
  emptyAction?: ReactNode;
  small?: boolean;
};

export default function ContasGroupClient({ contas, idCliente, vencContas, emptyAction, small }: Props) {
  const [verificados, setVerificados] = useState<Set<string>>(new Set());

  function marcarVerificados(atualizados: ContaAtualizada[]) {
    setVerificados((prev) => {
      const next = new Set(prev);
      atualizados.forEach((a) => next.add(String(a.id_conta)));
      return next;
    });
  }

  return (
    <ContasCards
      contas={contas}
      vencContas={vencContas}
      emptyAction={emptyAction}
      small={small}
      contaAction={(c) => (
        <>
          <VerificarContaButton
            idConta={c.id_conta}
            usuario={c.usuario}
            verificado={verificados.has(c.id_conta)}
            onVerificado={marcarVerificados}
          />
          <DesvincularContaButton idConta={c.id_conta} idCliente={idCliente} usuario={c.usuario} />
        </>
      )}
    />
  );
}
