export const dynamic = "force-dynamic";

import { pool } from "@/lib/db";
import VinculacaoAssinaturaClient from "./VinculacaoAssinaturaClient";
import AutoVincularAssinaturaButton from "./AutoVincularAssinaturaButton";

export type ContaVinculacaoAssinatura = {
  id_conta: number;
  usuario: string;
  rotulo: string | null;
  vencimento_real_painel: string | null;
  status_conta: string;
  id_painel_servidor: number;
  nome_painel: string;
  tipo_painel: string;
  id_assinatura: number | null;
  id_cliente_vinculado: number | null;
  nome_cliente_vinculado: string | null;
  sugestao_id_assinatura: number | null;
  sugestao_id_cliente: number | null;
  sugestao_nome_cliente: string | null;
  score: number | null;
};

async function getDados(): Promise<ContaVinculacaoAssinatura[]> {
  const { rows } = await pool.query<ContaVinculacaoAssinatura>(`
    SELECT
      c.id_conta,
      c.usuario,
      c.rotulo,
      c.vencimento_real_painel::text,
      c.status_conta,
      c.id_painel_servidor,
      ps.nome       AS nome_painel,
      ps.tipo       AS tipo_painel,
      c.id_assinatura,
      vinculo.id_cliente  AS id_cliente_vinculado,
      vinculo.nome        AS nome_cliente_vinculado,
      best.id_assinatura  AS sugestao_id_assinatura,
      best.id_cliente     AS sugestao_id_cliente,
      best.nome_cliente   AS sugestao_nome_cliente,
      best.score::float   AS score
    FROM public.contas c
    JOIN public.painel_servidores ps ON ps.id = c.id_painel_servidor
    LEFT JOIN LATERAL (
      SELECT cl2.id_cliente, cl2.nome
      FROM public.assinaturas a2
      JOIN public.clientes cl2 ON cl2.id_cliente = a2.id_cliente
      WHERE a2.id_assinatura = c.id_assinatura
      LIMIT 1
    ) vinculo ON c.id_assinatura IS NOT NULL
    LEFT JOIN LATERAL (
      SELECT
        a.id_assinatura,
        cl.id_cliente,
        cl.nome AS nome_cliente,
        similarity(cl.nome, COALESCE(NULLIF(c.rotulo, ''), c.usuario)) AS score
      FROM public.assinaturas a
      JOIN public.clientes cl ON cl.id_cliente = a.id_cliente
      JOIN public.pacote pk ON pk.id_pacote = a.id_pacote
      WHERE a.venc_contas = c.vencimento_real_painel
        AND a.status IN ('ativo', 'atrasado')
        AND lower(pk.contrato) ILIKE '%' || lower(ps.nome) || '%'
      ORDER BY similarity(cl.nome, COALESCE(NULLIF(c.rotulo, ''), c.usuario)) DESC
      LIMIT 1
    ) best ON c.vencimento_real_painel IS NOT NULL AND c.id_assinatura IS NULL
    ORDER BY
      (c.id_assinatura IS NOT NULL) ASC,
      best.score DESC NULLS LAST,
      ps.nome ASC,
      c.rotulo ASC NULLS LAST
  `);
  return rows;
}

export default async function VinculacaoAssinaturaPage() {
  const contas = await getDados();
  const semVinculo = contas.filter((c) => !c.id_assinatura).length;
  const vinculadas = contas.filter((c) => c.id_assinatura).length;
  const confiantes = contas.filter((c) => !c.id_assinatura && (c.score ?? 0) >= 0.7).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-zinc-900">Vinculação Contas → Assinaturas</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Associe cada conta dos painéis à assinatura correspondente para habilitar a renovação automática.
        </p>
      </div>

      <div className="flex flex-wrap gap-4 items-center">
        <div className="rounded-xl border bg-white px-5 py-3 shadow-sm">
          <p className="text-xs text-zinc-500">Sem vínculo</p>
          <p className="text-2xl font-bold text-orange-600">{semVinculo}</p>
        </div>
        <div className="rounded-xl border bg-white px-5 py-3 shadow-sm">
          <p className="text-xs text-zinc-500">Vinculadas</p>
          <p className="text-2xl font-bold text-emerald-600">{vinculadas}</p>
        </div>
        <div className="rounded-xl border bg-white px-5 py-3 shadow-sm">
          <p className="text-xs text-zinc-500">Total</p>
          <p className="text-2xl font-bold text-zinc-800">{contas.length}</p>
        </div>
        {confiantes > 0 && <AutoVincularAssinaturaButton total={confiantes} />}
      </div>

      <VinculacaoAssinaturaClient contas={contas} />
    </div>
  );
}
