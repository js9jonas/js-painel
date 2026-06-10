import { pool } from '@/lib/db'
import { findLabels, handleLabel, WaLabel } from './meta-labels'

const MANAGED_PANELS = ['club', 'central', 'uniplay', 'fast', 'unitv', 'now', 'liebe', 'tvexpress'] as const
type PanelType = (typeof MANAGED_PANELS)[number]

// Cache das etiquetas — evita chamar findLabels a cada mensagem recebida
let labelsCache:   WaLabel[] | null = null
let labelsCacheAt: number           = 0
const LABELS_TTL = 3_600_000 // 1 hora

async function getLabels(): Promise<WaLabel[]> {
  if (labelsCache && Date.now() - labelsCacheAt < LABELS_TTL) return labelsCache
  labelsCache   = await findLabels()
  labelsCacheAt = Date.now()
  return labelsCache
}

function panelMatchesLabel(panelTipo: PanelType, labelName: string): boolean {
  const name = labelName.toLowerCase()
  if (panelTipo === 'unitv') return name === 'unit' || name === 'unitv'
  return name === panelTipo
}

/**
 * Normaliza número BR para wa_id (sem + , com código de país).
 * public.contatos.telefone usa DDD+número sem código de país (ex: 5193162326).
 * O wa_id precisa ter 55 na frente (ex: 555193162326).
 */
function telToWaId(telefone: string): string {
  const digits = telefone.replace(/\D/g, '')
  return digits.startsWith('55') ? digits : `55${digits}`
}

/**
 * Retorna possíveis formatos de telefone armazenados em public.contatos
 * a partir do número que chega no webhook (já com código de país).
 */
function fromToPhones(from: string): string[] {
  const digits = from.replace(/\D/g, '')
  const withoutCountry = digits.startsWith('55') ? digits.slice(2) : digits

  if (withoutCountry.length === 11) {
    // Celular com 9º dígito — tenta também sem ele
    const withoutNinth = withoutCountry.slice(0, 2) + withoutCountry.slice(3)
    return [withoutCountry, withoutNinth]
  }
  return [withoutCountry]
}

/**
 * Sincroniza etiquetas WA do contato com os painéis ativos na assinatura.
 * Dispara no máximo uma vez por dia por contato para reduzir chamadas à API.
 */
export async function maybeSyncLabels(from: string): Promise<void> {
  try {
    const phones = fromToPhones(from)

    const { rows: contacts } = await pool.query<{
      id_cliente: string
      labels_sync_em: Date | null
      telefone: string
    }>(
      `SELECT id_cliente, labels_sync_em, telefone
       FROM public.contatos
       WHERE telefone = ANY($1)
       LIMIT 1`,
      [phones]
    )
    if (!contacts.length) return

    const { id_cliente, labels_sync_em, telefone } = contacts[0]

    // Já sincronizado hoje → pula
    if (labels_sync_em) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      if (new Date(labels_sync_em) >= today) return
    }

    // Painéis ativos via contas.id_servidor (consumo_servidor está vazio desde 08/06/2026)
    const { rows } = await pool.query<{ painel_tipo: PanelType }>(
      `SELECT DISTINCT s.painel_tipo
       FROM public.assinaturas a
       JOIN public.contas c ON c.id_assinatura = a.id_assinatura
       JOIN public.servidores s ON s.id_servidor = c.id_servidor
       WHERE a.id_cliente = $1
         AND a.status IN ('ativo', 'atrasado', 'pendente', 'vencido')
         AND c.removido_em IS NULL
         AND s.painel_tipo = ANY($2)`,
      [id_cliente, MANAGED_PANELS]
    )

    const activePanels = new Set(rows.map(r => r.painel_tipo))
    const allLabels    = await getLabels()
    const waId         = telToWaId(telefone)

    for (const panel of MANAGED_PANELS) {
      const label = allLabels.find(l => panelMatchesLabel(panel, l.name))
      if (!label) {
        console.warn(`[label-sync] etiqueta não encontrada para painel '${panel}'`)
        continue
      }
      const action = activePanels.has(panel) ? 'add' : 'remove'
      await handleLabel(waId, label.id, action).catch((err: Error) =>
        console.error(`[label-sync] ${action} '${label.name}' → ${waId}: ${err.message}`)
      )
    }

    await pool.query(
      `UPDATE public.contatos SET labels_sync_em = NOW() WHERE telefone = ANY($1)`,
      [phones]
    )

    console.log(`[label-sync] ${from} → painéis: [${[...activePanels].join(', ')}]`)
  } catch (err) {
    console.error('[label-sync] erro inesperado:', err)
  }
}
