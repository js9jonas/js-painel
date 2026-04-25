export const dynamic = "force-dynamic";

import { pool } from "@/lib/db";
import VinculacaoClient from "@/components/servidores/VinculacaoClient";

export type ContaVinculacao = {
  id_conta: number;
  usuario: string;
  rotulo: string;
  vencimento_real_painel: string | null;
  status_conta: string;
  id_servidor: number;
  nome_servidor: string;
  id_cliente: number | null;
  nome_cliente: string | null;
};

async function getContasParaVincular(): Promise<ContaVinculacao[]> {
  const { rows } = await pool.query<ContaVinculacao>(`
    SELECT
      c.id_conta,
      c.usuario,
      c.rotulo,
      c.vencimento_real_painel::text,
      c.status_conta,
      c.id_servidor,
      s.nome_interno AS nome_servidor,
      a.id_cliente,
      cl.nome AS nome_cliente
    FROM public.contas c
    JOIN public.servidores s ON s.id_servidor = c.id_servidor
    LEFT JOIN public.aplicativos a ON a.id_conta = c.id_conta
    LEFT JOIN public.clientes cl ON cl.id_cliente = a.id_cliente
    WHERE s.painel_tipo IS NOT NULL
    ORDER BY
      (a.id_cliente IS NOT NULL) ASC,
      s.nome_interno ASC,
      c.rotulo ASC
  `);
  return rows;
}

export default async function VinculacaoPage() {
  const contas = await getContasParaVincular();
  const semVinculo = contas.filter((c) => !c.id_cliente).length;
  const comVinculo = contas.filter((c) => c.id_cliente).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-zinc-900">Vinculação de Contas</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Associe as contas dos painéis IPTV aos clientes do sistema.
        </p>
      </div>

      <div className="flex gap-4">
        <div className="rounded-xl border bg-white px-5 py-3 shadow-sm">
          <p className="text-xs text-zinc-500">Sem vínculo</p>
          <p className="text-2xl font-bold text-orange-600">{semVinculo}</p>
        </div>
        <div className="rounded-xl border bg-white px-5 py-3 shadow-sm">
          <p className="text-xs text-zinc-500">Vinculados</p>
          <p className="text-2xl font-bold text-emerald-600">{comVinculo}</p>
        </div>
        <div className="rounded-xl border bg-white px-5 py-3 shadow-sm">
          <p className="text-xs text-zinc-500">Total</p>
          <p className="text-2xl font-bold text-zinc-800">{contas.length}</p>
        </div>
      </div>

      <VinculacaoClient contas={contas} />
    </div>
  );
}
