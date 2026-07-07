import { pool } from '@/lib/db'
import { enviarTextoWhatsapp, registrarMensagemWhatsapp } from '@/lib/whatsapp-envio'

function formatarData(d: string | Date): string {
  const dt = new Date(d)
  const dia = String(dt.getUTCDate()).padStart(2, '0')
  const mes = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const ano = dt.getUTCFullYear()
  return `${dia}/${mes}/${ano}`
}

interface NotificarRenovacaoResultado {
  enviado: boolean
  motivo?: string
  telefone?: string
}

export async function notificarRenovacao(
  idCliente: string,
  novoVencimento: string | null,
  telas: number | null
): Promise<NotificarRenovacaoResultado> {
  const cliente = await pool.query(`SELECT nome FROM public.clientes WHERE id_cliente = $1::bigint`, [idCliente])
  if (!cliente.rows[0]) return { enviado: false, motivo: 'Cliente não encontrado' }

  const telefoneAtivo = await pool.query(
    `SELECT ct.telefone
     FROM public.contatos ct
     JOIN public.whatsapp_mensagens wm
       ON wm.telefone = ct.telefone AND wm.origem = 'cliente' AND wm.recebida_em >= NOW() - INTERVAL '24 hours'
     WHERE ct.id_cliente = $1::bigint
     ORDER BY wm.recebida_em DESC
     LIMIT 1`,
    [idCliente]
  )

  if (!telefoneAtivo.rows[0]) {
    return { enviado: false, motivo: 'Nenhuma mensagem recebida deste cliente nas últimas 24h' }
  }

  const telefone = telefoneAtivo.rows[0].telefone
  const dataTxt = novoVencimento ? formatarData(novoVencimento) : '-'

  const texto =
    `🔰 *ASSINATURA RENOVADA* ♻️\n\n` +
    `📺 Telas: ${telas ?? '-'}\n` +
    `📅 Novo vencimento: ${dataTxt}\n\n` +
    `Se precisar de algo é só chamar 📲\n\n` +
    `😊 Muito obrigado! 🤝`

  const msgId = await enviarTextoWhatsapp(telefone, texto)
  await registrarMensagemWhatsapp(msgId, telefone, texto, { source: 'notificacao-renovacao' })

  if (!msgId) return { enviado: false, motivo: 'Falha ao enviar mensagem via WhatsApp' }
  return { enviado: true, telefone }
}
