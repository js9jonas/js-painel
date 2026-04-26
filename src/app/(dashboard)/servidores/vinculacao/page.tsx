export const dynamic = "force-dynamic";

import { pool } from "@/lib/db";
import VinculacaoClient from "@/components/servidores/VinculacaoClient";
import AutoVincularButton from "@/components/servidores/AutoVincularButton";

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
  sugestao_id_cliente: number | null;
  sugestao_nome_cliente: string | null;
  pacote_contrato: string | null;
  pacote_status: string | null;
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
      s.codigo_publico AS nome_servidor,
      a.id_cliente,
      cl.nome AS nome_cliente,
      sc.id_cliente AS sugestao_id_cliente,
      sc.nome AS sugestao_nome_cliente,
      asn.contrato AS pacote_contrato,
      asn.status AS pacote_status
    FROM public.contas c
    JOIN public.servidores s ON s.id_servidor = c.id_servidor
    LEFT JOIN public.aplicativos a ON a.id_conta = c.id_conta
    LEFT JOIN public.clientes cl ON cl.id_cliente = a.id_cliente
    LEFT JOIN LATERAL (
      SELECT cl2.id_cliente, cl2.nome
      FROM public.clientes cl2
      WHERE lower(cl2.nome) = lower(c.rotulo)
        AND (SELECT COUNT(*) FROM public.clientes cl3 WHERE lower(cl3.nome) = lower(c.rotulo)) = 1
      LIMIT 1
    ) sc ON a.id_cliente IS NULL AND c.rotulo IS NOT NULL AND c.rotulo != ''
    LEFT JOIN LATERAL (
      SELECT pk.contrato, asn2.status
      FROM public.assinaturas asn2
      LEFT JOIN public.pacote pk ON pk.id_pacote = asn2.id_pacote
      WHERE asn2.id_cliente = COALESCE(a.id_cliente, sc.id_cliente)
        AND asn2.status IN ('ativo', 'atrasado', 'pendente')
      ORDER BY CASE asn2.status WHEN 'ativo' THEN 1 WHEN 'atrasado' THEN 2 WHEN 'pendente' THEN 3 END,
               asn2.venc_contrato DESC
      LIMIT 1
    ) asn ON COALESCE(a.id_cliente, sc.id_cliente) IS NOT NULL
    WHERE s.painel_tipo IS NOT NULL
    ORDER BY
      (a.id_cliente IS NOT NULL) ASC,
      (sc.id_cliente IS NOT NULL) DESC,
      s.codigo_publico ASC,
      c.rotulo ASC
  `);
  return rows;
}

export default async function VinculacaoPage() {
  const contas = await getContasParaVincular();
  const semVinculo = contas.filter((c) => !c.id_cliente).length;
  const comVinculo = contas.filter((c) => c.id_cliente).length;
  const comSugestao = contas.filter((c) => !c.id_cliente && c.sugestao_id_cliente).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-zinc-900">Vinculação de Contas</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Associe as contas dos painéis IPTV aos clientes do sistema.
        </p>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
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
        {comSugestao > 0 && (
          <AutoVincularButton total={comSugestao} />
        )}
      </div>

      <VinculacaoClient contas={contas} />
    </div>
  );
}
