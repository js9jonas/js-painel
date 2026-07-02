// src/lib/alertas.ts
import { pool } from "@/lib/db";

export type AlertaSubConta = {
    id_conta: string;
    usuario: string;
    vencimento_real_painel: string;
    id_painel_servidor: number | null;
    nome_painel: string | null;
    status_conta: string | null;
};

export type AlertaContaRow = {
    id_cliente: string;
    nome: string;
    id_assinatura: string;
    venc_contas: string | null;
    venc_contrato: string;
    pacote_contrato: string | null;
    pacote_telas: number | null;
    status: string | null;
    contas_vinculadas_total: number;
    sub_contas: AlertaSubConta[];
};

export type AlertaAppRow = {
    id_cliente: string;
    nome: string;
    id_app_registro: string;
    validade: string;
    mac: string | null;
    observacao: string | null;       // sublinha do MAC
    nome_app: string;
    venc_contrato_cliente: string | null;
    pacote_contrato: string | null;  // coluna Pacote
    total_apps: number;              // sublinha do Pacote
};

export async function getAlertasContas(dias = 5): Promise<AlertaContaRow[]> {
    const { rows } = await pool.query<AlertaContaRow>(
        `SELECT
   c.id_cliente::text,
   c.nome,
   a.id_assinatura::text,
   a.venc_contas::text,
   a.venc_contrato::text,
   a.status,
   p.contrato::text                              AS pacote_contrato,
   p.telas::int                                  AS pacote_telas,
   COUNT(ct.id_conta)
     FILTER (WHERE ct.removido_em IS NULL)::int  AS contas_vinculadas_total,
   COALESCE(
     json_agg(
       json_build_object(
         'id_conta',              ct.id_conta::text,
         'usuario',               ct.usuario,
         'vencimento_real_painel',ct.vencimento_real_painel::text,
         'id_painel_servidor',    ct.id_painel_servidor,
         'nome_painel',           ps.nome,
         'status_conta',          ct.status_conta
       ) ORDER BY ct.vencimento_real_painel ASC NULLS LAST
     ) FILTER (
       WHERE ct.id_conta IS NOT NULL
         AND ct.vencimento_real_painel IS NOT NULL
         AND ct.removido_em IS NULL
     ),
     '[]'::json
   )                                             AS sub_contas
 FROM public.assinaturas a
 JOIN public.clientes c ON c.id_cliente = a.id_cliente
 LEFT JOIN public.pacote p ON p.id_pacote = a.id_pacote
 LEFT JOIN public.contas ct
        ON ct.id_assinatura = a.id_assinatura AND ct.removido_em IS NULL
 LEFT JOIN public.painel_servidores ps ON ps.id = ct.id_painel_servidor
 WHERE lower(btrim(a.status)) IN ('ativo','atrasado','pendente')
   AND a.venc_contrato IS NOT NULL
   AND a.venc_contrato::date >= CURRENT_DATE
   AND (
     -- assinatura vence até +N dias (inclui vencidas há qualquer tempo), e o contrato ainda cobre período após o vencimento
     (a.venc_contas IS NOT NULL
       AND a.venc_contas::date <= CURRENT_DATE + ($1::int || ' days')::interval
       AND a.venc_contrato::date > a.venc_contas::date)
     OR
     -- ou tem conta com vencimento_real_painel até +N dias (inclui vencidas há qualquer tempo), e o contrato cobre além dele
     EXISTS (
       SELECT 1 FROM public.contas ct2
       WHERE ct2.id_assinatura = a.id_assinatura
         AND ct2.removido_em IS NULL
         AND ct2.vencimento_real_painel IS NOT NULL
         AND ct2.vencimento_real_painel::date <= CURRENT_DATE + ($1::int || ' days')::interval
         AND a.venc_contrato::date > ct2.vencimento_real_painel::date
     )
   )
 GROUP BY a.id_assinatura, c.id_cliente, c.nome, a.venc_contas, a.venc_contrato, a.status, p.contrato, p.telas
 ORDER BY LEAST(
   a.venc_contas::date,
   MIN(ct.vencimento_real_painel)::date
 ) ASC NULLS LAST`,
        [dias]
    );
    return rows;
}

export async function getAlertasApps(dias = 7): Promise<AlertaAppRow[]> {
    const { rows } = await pool.query<AlertaAppRow>(
        `SELECT
       c.id_cliente::text,
       c.nome,
       ap.id_app_registro::text,
       ap.validade::text,
       ap.mac,
       ap.observacao,
       app.nome_app,
       ult.venc_contrato_cliente,
       ult.pacote_contrato,
       cnt.total_apps
     FROM public.aplicativos ap
     JOIN public.clientes c ON c.id_cliente = ap.id_cliente
     JOIN public.apps app ON app.id_app = ap.id_app
     -- venc_contrato_cliente + pacote_contrato: última assinatura do cliente
     LEFT JOIN LATERAL (
       SELECT
         a.venc_contrato::text AS venc_contrato_cliente,
         p.contrato           AS pacote_contrato
       FROM public.assinaturas a
       LEFT JOIN public.pacote p ON p.id_pacote = a.id_pacote
       WHERE a.id_cliente = ap.id_cliente
       ORDER BY a.venc_contrato DESC
       LIMIT 1
     ) ult ON true
     -- total de aplicativos ativos do cliente
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS total_apps
       FROM public.aplicativos ap2
       WHERE ap2.id_cliente = ap.id_cliente
         AND lower(btrim(ap2.status)) = 'ativa'
     ) cnt ON true
     WHERE lower(btrim(ap.status)) = 'ativa'
       AND ap.validade IS NOT NULL
       AND ap.validade::date <= CURRENT_DATE + ($1::int || ' days')::interval
     ORDER BY ap.validade ASC`,
        [dias]
    );
    return rows;
}