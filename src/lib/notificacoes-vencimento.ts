import { pool } from '@/lib/db'

export type TipoNotificacaoVencimento = 'vencidos' | 'amanha'

export interface ItemNotificacaoVencimento {
  id_assinatura: string
  nome: string
  telefone: string | null
  telas: number
  venc_contrato: string
  status: string
  jaEnviado: boolean
  falhouEnvio: boolean
}

const TEMPLATE_POR_TIPO: Record<TipoNotificacaoVencimento, string> = {
  vencidos: 'vencido_plano',
  amanha: 'lembrete_vencimento',
}

const SOURCE_POR_TIPO: Record<TipoNotificacaoVencimento, string> = {
  vencidos: 'bulk-vencido-plano',
  amanha: 'bulk-lembrete-vencimento',
}

export function templateDoTipo(tipo: TipoNotificacaoVencimento): string {
  return TEMPLATE_POR_TIPO[tipo]
}

export function sourceDoTipo(tipo: TipoNotificacaoVencimento): string {
  return SOURCE_POR_TIPO[tipo]
}

function intervaloDoTipo(tipo: TipoNotificacaoVencimento): string {
  return tipo === 'vencidos' ? "CURRENT_DATE - INTERVAL '1 day'" : "CURRENT_DATE + INTERVAL '1 day'"
}

export async function listarPendentes(tipo: TipoNotificacaoVencimento): Promise<ItemNotificacaoVencimento[]> {
  const source = sourceDoTipo(tipo)

  const r = await pool.query(
    `SELECT a.id_assinatura::text, c.nome, ct.telefone, p.telas, a.venc_contrato::text, a.status,
       ultimo.tentou AS tentou_hoje, ultimo.status AS status_envio
     FROM public.assinaturas a
     JOIN public.clientes c ON c.id_cliente = a.id_cliente
     JOIN public.planos p ON p.id_plano = a.id_plano
     LEFT JOIN LATERAL (
       SELECT telefone FROM public.contatos WHERE id_cliente = c.id_cliente ORDER BY criado_em ASC LIMIT 1
     ) ct ON true
     LEFT JOIN LATERAL (
       SELECT true AS tentou, wm.status
       FROM public.whatsapp_mensagens wm
       WHERE wm.telefone = ct.telefone AND wm.source = $1 AND wm.recebida_em::date = CURRENT_DATE
       ORDER BY wm.recebida_em DESC LIMIT 1
     ) ultimo ON true
     WHERE a.venc_contrato::date = ${intervaloDoTipo(tipo)}
       AND a.status NOT IN ('inativo')
     ORDER BY c.nome`,
    [source]
  )

  return r.rows.map((row) => {
    const tentouHoje = row.tentou_hoje === true
    const falhouEnvio = tentouHoje && row.status_envio === 'failed'
    return {
      id_assinatura: row.id_assinatura,
      nome: row.nome,
      telefone: row.telefone,
      telas: row.telas,
      venc_contrato: row.venc_contrato,
      status: row.status,
      jaEnviado: tentouHoje && !falhouEnvio,
      falhouEnvio,
    }
  })
}

export async function buscarDadosParaEnvio(idAssinatura: string): Promise<{
  nome: string
  telefone: string | null
  telas: number
  venc_contrato: string
} | null> {
  const r = await pool.query(
    `SELECT c.nome, ct.telefone, p.telas, a.venc_contrato::text
     FROM public.assinaturas a
     JOIN public.clientes c ON c.id_cliente = a.id_cliente
     JOIN public.planos p ON p.id_plano = a.id_plano
     LEFT JOIN LATERAL (
       SELECT telefone FROM public.contatos WHERE id_cliente = c.id_cliente ORDER BY criado_em ASC LIMIT 1
     ) ct ON true
     WHERE a.id_assinatura = $1::bigint`,
    [idAssinatura]
  )
  if (!r.rows[0]) return null
  return r.rows[0]
}
