"use client";

import { useState, type ReactNode } from "react";
import ContasCards from "./ContasCards";
import VerificarContaButton from "./VerificarContaButton";
import DesvincularContaButton from "./DesvincularContaButton";
import ContaAcoesMenu from "./ContaAcoesMenu";
import type { ContaPainelVinculada } from "@/lib/clientes";

type ContaAtualizada = { id_conta: number; vencimento: string | null; status: string };
type AppVinculado = { id_app_registro: number; nome_app: string | null };

type Props = {
  contas: ContaPainelVinculada[];
  idCliente: string;
  vencContas?: string | null;
  emptyAction?: ReactNode;
  small?: boolean;
  appsVinculados?: Map<string, AppVinculado[]>; // id_conta → apps
};

export default function ContasGroupClient({ contas, idCliente, vencContas, emptyAction, small, appsVinculados }: Props) {
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
          <ContaAcoesMenu
            conta={c}
            idCliente={idCliente}
            appsVinculados={appsVinculados?.get(c.id_conta) ?? []}
          />
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
