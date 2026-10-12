import { pool } from '@/lib/db'

export type TipoNotificacaoVencimento = 'vencidos' | 'amanha'

export interface ItemNotificacaoVencimento {
  id_assinatura: string
  id_cliente: number
  nome: string
  telefone: string | null
  telas: number
  venc_contrato: string
  status: string
  jaEnviado: boolean
  falhouEnvio: boolean
}

const TEMPLATE_POR_TIPO: Record<TipoNotificacaoVencimento, string> = {
  vencidos: 'vencido_plano_v2',
  amanha: 'lembrete_vencimento_v2',
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
  // Mesmo critério de templateJaEnviadoHoje: o template por número, venha do disparo ou do /chat
  const templateName = templateDoTipo(tipo)

  const r = await pool.query(
    `SELECT a.id_assinatura::text, c.id_cliente, c.nome, ct.telefone, p.telas, a.venc_contrato::text, a.status,
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
       WHERE wm.telefone = ct.telefone AND wm.recebida_em >= CURRENT_DATE AND wm.tipo = 'template'
         AND CASE WHEN wm.tipo = 'template' AND wm.conteudo LIKE '{%' THEN wm.conteudo::jsonb->>'name' END = $1
       ORDER BY wm.recebida_em DESC LIMIT 1
     ) ultimo ON true
     WHERE a.venc_contrato::date = ${intervaloDoTipo(tipo)}
       AND a.status NOT IN ('inativo')
     ORDER BY c.nome`,
    [templateName]
  )

  return r.rows.map((row) => {
    const tentouHoje = row.tentou_hoje === true
    const falhouEnvio = tentouHoje && row.status_envio === 'failed'
    return {
      id_assinatura: row.id_assinatura,
      id_cliente: row.id_cliente,
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
  identificacao: string | null
  venc_contrato: string
} | null> {
  const r = await pool.query(
    `SELECT c.nome, ct.telefone, p.telas, a.identificacao, a.venc_contrato::text
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
