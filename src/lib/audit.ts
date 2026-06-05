import { PoolClient } from "pg";
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
       dados_depois
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
  | "desvinculo_conta";

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
  await client.query(
    `INSERT INTO public.audit_log
       (tipo, id_cliente, id_assinatura, id_app_registro, descricao, dados_antes, dados_depois)
     VALUES ($1, $2::bigint, $3::bigint, $4, $5, $6, $7)`,
    [
      params.tipo,
      params.id_cliente != null ? String(params.id_cliente) : null,
      params.id_assinatura != null ? String(params.id_assinatura) : null,
      params.id_app_registro ?? null,
      params.descricao ?? null,
      params.dados_antes != null ? JSON.stringify(params.dados_antes) : null,
      params.dados_depois != null ? JSON.stringify(params.dados_depois) : null,
    ]
  );
}
