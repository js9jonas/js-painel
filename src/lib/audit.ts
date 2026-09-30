import { PoolClient } from "pg";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";

export type AuditLogRow = {
  id: string;
  criado_em: string;
  tipo: string;
  id_assinatura: string | null;
  id_app_registro: number | null;
  descricao: string | null;
  dados_antes: Record<string, unknown> | null;
  dados_depois: Record<string, unknown> | null;
  usuario: string | null;
};

export async function getAuditLogByClienteId(idCliente: string): Promise<AuditLogRow[]> {
  const { rows } = await pool.query<AuditLogRow>(
    `SELECT
       id::text,
       criado_em,
       tipo,
       id_assinatura::text,
       id_app_registro,
       descricao,
       dados_antes,
       dados_depois,
       usuario
     FROM public.audit_log
     WHERE id_cliente = $1::bigint
     ORDER BY criado_em DESC
     LIMIT 200`,
    [idCliente]
  );
  return rows;
}

export type AuditTipo =
  | "troca_pacote"
  | "troca_plano"
  | "cancelamento"
  | "edicao_cadastro"
  | "alteracao_app"
  | "vinculo_conta"
  | "desvinculo_conta"
  | "criacao_teste_conta"
  | "renovacao"
  | "exclusao_pagamento";

/**
 * E-mail do usuário logado, ou null fora de uma sessão (n8n/cron) ou se a
 * sessão não puder ser lida — auditoria nunca derruba a operação principal.
 */
async function usuarioAtual(): Promise<string | null> {
  try {
    const session = await auth();
    return session?.user?.email ?? null;
  } catch {
    return null;
  }
}

/**
 * IP e navegador de quem fez a requisição, pra identificar o aparelho numa
 * investigação. IP = ÚLTIMA entrada do X-Forwarded-For (o Traefik do Easypanel
 * mantém o valor enviado pelo visitante e acrescenta o IP real no fim).
 */
export function origemRequisicao(req: NextRequest): { ip: string | null; navegador: string | null } {
  const xff = req.headers.get("x-forwarded-for");
  const ip = xff ? xff.split(",").map((s) => s.trim()).filter(Boolean).pop() ?? null : null;
  const ua = req.headers.get("user-agent");
  return { ip, navegador: ua ? ua.slice(0, 160) : null };
}

export async function registrarAudit(
  client: PoolClient,
  params: {
    tipo: AuditTipo;
    id_cliente: bigint | number | string | null;
    id_assinatura?: bigint | number | string | null;
    id_app_registro?: number | null;
    descricao?: string | null;
    dados_antes?: Record<string, unknown> | null;
    dados_depois?: Record<string, unknown> | null;
  }
) {
  const usuario = await usuarioAtual();
  await client.query(
    `INSERT INTO public.audit_log
       (tipo, id_cliente, id_assinatura, id_app_registro, descricao, dados_antes, dados_depois, usuario)
     VALUES ($1, $2::bigint, $3::bigint, $4, $5, $6, $7, $8)`,
    [
      params.tipo,
      params.id_cliente != null ? String(params.id_cliente) : null,
      params.id_assinatura != null ? String(params.id_assinatura) : null,
      params.id_app_registro ?? null,
      params.descricao ?? null,
      params.dados_antes != null ? JSON.stringify(params.dados_antes) : null,
      params.dados_depois != null ? JSON.stringify(params.dados_depois) : null,
      usuario,
    ]
  );
}
