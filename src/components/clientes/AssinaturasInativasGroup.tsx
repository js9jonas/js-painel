"use client";

import { useState } from "react";
import type { AssinaturaRow } from "@/lib/clientes";
import type { PlanoRow } from "@/lib/planos";
import type { PacoteRow } from "@/lib/pacotes";
import AssinaturaCard from "./AssinaturaCard";

type Props = {
  assinaturas: AssinaturaRow[];
  idCliente: string;
  nomeCliente: string;
  contasPorAssinatura: Record<string, import("@/lib/clientes").ContaPainelVinculada[]>;
  appsPorConta: Record<string, { id_app_registro: number; nome_app: string | null }[]>;
  paineisList: { id: number; nome: string; tipo: string }[];
  planos: PlanoRow[];
  pacotes: PacoteRow[];
  planosRenovar: { id_plano: string; tipo: string; telas: number; meses: number; valor: string }[];
  diasPorAssinatura: Record<string, number | null>;
};

export default function AssinaturasInativasGroup({
  assinaturas,
  idCliente,
  nomeCliente,
  contasPorAssinatura,
  appsPorConta,
  paineisList,
  planos,
  pacotes,
  planosRenovar,
  diasPorAssinatura,
}: Props) {
  const [expandido, setExpandido] = useState(false);

  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
      >
        <span>
          {assinaturas.length} {assinaturas.length === 1 ? "assinatura inativa" : "assinaturas inativas"}
        </span>
        <span className="text-zinc-400">{expandido ? "▲ recolher" : "▼ ver"}</span>
      </button>

      {expandido && (
        <div className="px-3 pb-3 space-y-2 border-t">
          {assinaturas.map((a) => (
            <div key={a.id_assinatura} className="pt-2">
              <AssinaturaCard
                assinatura={a}
                idCliente={idCliente}
                nomeCliente={nomeCliente}
                contas={contasPorAssinatura[String(a.id_assinatura)] ?? []}
                appsPorConta={appsPorConta}
                paineisList={paineisList}
                planos={planos}
                pacotes={pacotes}
                planosRenovar={planosRenovar}
                diasUltimoPagamento={diasPorAssinatura[String(a.id_assinatura)] ?? null}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
