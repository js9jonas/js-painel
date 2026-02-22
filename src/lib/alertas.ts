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
    nome_app: string;
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
 WHERE lower(btrim(a.status)) = 'ativo'
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
       app.nome_app
     FROM public.aplicativos ap
     JOIN public.clientes c ON c.id_cliente = ap.id_cliente
     JOIN public.apps app ON app.id_app = ap.id_app
     WHERE lower(btrim(ap.status)) = 'ativa'
       AND ap.validade IS NOT NULL
       AND ap.validade::date <= CURRENT_DATE + ($1::int || ' days')::interval
       AND ap.validade::date >= CURRENT_DATE
     ORDER BY ap.validade ASC`,
        [dias]
    );
    return rows;
}