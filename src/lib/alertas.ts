// src/lib/alertas.ts
import { pool } from "@/lib/db";

export type AlertaContaRow = {
    id_cliente: string;
    nome: string;
    id_assinatura: string;
    venc_contas: string;
    venc_contrato: string;
    pacote_contrato: string | null;
    pacote_telas: number | null;
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
   p.contrato::text AS pacote_contrato,
   p.telas::int AS pacote_telas
 FROM public.assinaturas a
 JOIN public.clientes c ON c.id_cliente = a.id_cliente
 LEFT JOIN public.pacote p ON p.id_pacote = a.id_pacote
 LEFT JOIN public.planos pl ON pl.id_plano = a.id_plano
WHERE lower(btrim(a.status)) IN ('ativo', 'atrasado', 'pendente')
   AND a.venc_contas IS NOT NULL
   AND a.venc_contrato IS NOT NULL
   AND a.venc_contas::date <= CURRENT_DATE + ($1::int || ' days')::interval
   AND a.venc_contrato::date > a.venc_contas::date
 ORDER BY a.venc_contas ASC`,
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
       AND ap.validade::date >= CURRENT_DATE - 1
     ORDER BY ap.validade ASC`,
        [dias]
    );
    return rows;
}