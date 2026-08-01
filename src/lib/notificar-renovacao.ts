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
  /** true quando não havia janela de 24h e a notificação foi enviada como link no Telegram, não direto pelo WhatsApp */
  viaTelegram?: boolean
}

function montarTexto(telas: number | null, dataTxt: string, ehNovo: boolean, identificacao: string | null): string {
  const linhaIdentificacao = identificacao ? `🏷️ Identificação: ${identificacao}\n` : ''
  if (ehNovo) {
    return (
      `🎉 *BEM-VINDO(A)!* 🎉\n\n` +
      `📺 Telas: ${telas ?? '-'}\n` +
      linhaIdentificacao +
      `📅 Vencimento: ${dataTxt}\n\n` +
      `Qualquer dúvida é só chamar por aqui 📲\n\n` +
      `😊 Muito obrigado pela confiança, esperamos que aproveite bem!`
    )
  }
  return (
    `🔰 *ASSINATURA RENOVADA* ♻️\n\n` +
    `📺 Telas: ${telas ?? '-'}\n` +
    linhaIdentificacao +
    `📅 Novo vencimento: ${dataTxt}\n\n` +
    `Se precisar de algo é só chamar 📲\n\n` +
    `🙏 Muito obrigado pela confiança e por continuar com a gente!\n` +
    `Aproveite bem sua assinatura! 😊`
  )
}

export async function notificarRenovacao(
  idCliente: string,
  novoVencimento: string | null,
  telas: number | null,
  ehNovo: boolean = false,
  identificacao: string | null = null
): Promise<NotificarRenovacaoResultado> {
  const cliente = await pool.query(`SELECT nome FROM public.clientes WHERE id_cliente = $1::bigint`, [idCliente])
  if (!cliente.rows[0]) return { enviado: false, motivo: 'Cliente não encontrado' }

  const dataTxt = novoVencimento ? formatarData(novoVencimento) : '-'
  const texto = montarTexto(telas, dataTxt, ehNovo, identificacao)

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

  if (telefoneAtivo.rows[0]) {
    const telefone = telefoneAtivo.rows[0].telefone
    const msgId = await enviarTextoWhatsapp(telefone, texto)
    await registrarMensagemWhatsapp(msgId, telefone, texto, { source: ehNovo ? 'notificacao-boas-vindas' : 'notificacao-renovacao' })
    if (msgId) return { enviado: true, telefone }
    // Falha no envio direto mesmo com janela aberta — segue pro fallback Telegram como rede de segurança
  }

  return notificarRenovacaoTelegram({ idCliente, nomeCliente: cliente.rows[0].nome, texto, ehNovo })
}

/**
 * Sem janela de 24h aberta (ou falha no envio direto), a notificação vai para o Telegram
 * de Jonas com um botão wa.me pré-preenchido — ele confere e envia manualmente pelo próprio
 * WhatsApp, mesmo padrão usado na cortesia de indicação (ver notificarCortesiaTelegram).
 */
async function notificarRenovacaoTelegram({
  idCliente,
  nomeCliente,
  texto,
  ehNovo,
}: {
  idCliente: string
  nomeCliente: string | null
  texto: string
  ehNovo: boolean
}): Promise<NotificarRenovacaoResultado> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID_JONAS
  if (!botToken || !chatId) {
    return { enviado: false, motivo: 'Nenhuma mensagem recebida deste cliente nas últimas 24h' }
  }

  // Sem restrição de 24h aqui — pega o telefone com a conversa mais recente entre os cadastrados
  const { rows } = await pool.query(
    `SELECT ct.telefone
     FROM public.contatos ct
     JOIN public.whatsapp_mensagens wm
       ON wm.telefone = ct.telefone AND wm.origem = 'cliente'
     WHERE ct.id_cliente = $1::bigint
     ORDER BY wm.recebida_em DESC
     LIMIT 1`,
    [idCliente]
  )
  const telefoneRaw: string | undefined = rows[0]?.telefone
  if (!telefoneRaw) {
    return { enviado: false, motivo: 'Nenhuma mensagem recebida deste cliente nas últimas 24h' }
  }

  const digits = telefoneRaw.replace(/\D/g, '')
  const numero = digits.startsWith('55') ? digits : `55${digits}`
  const linkWhatsapp = `https://wa.me/${numero}?text=${encodeURIComponent(texto).replace(/!/g, '%21')}`

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: ehNovo
          ? `🎉 *Boas-vindas sem conversa ativa — ${nomeCliente ?? 'cliente'}*\n\nClique no botão pra abrir o WhatsApp com a mensagem pronta e enviar.`
          : `🔰 *Renovação sem conversa ativa — ${nomeCliente ?? 'cliente'}*\n\nClique no botão pra abrir o WhatsApp com a mensagem pronta e enviar.`,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '📲 Abrir no WhatsApp', url: linkWhatsapp }]],
        },
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('[NotificarRenovacao] Erro ao notificar Telegram:', err)
      return { enviado: false, motivo: 'Nenhuma mensagem recebida deste cliente nas últimas 24h; falha ao notificar Telegram' }
    }
  } catch (err) {
    console.error('[NotificarRenovacao] Timeout/erro de rede ao notificar Telegram:', err)
    return { enviado: false, motivo: 'Nenhuma mensagem recebida deste cliente nas últimas 24h; falha ao notificar Telegram' }
  }

  return {
    enviado: false,
    viaTelegram: true,
    motivo: 'Sem conversa ativa nas últimas 24h — link enviado ao Telegram para envio manual',
    telefone: telefoneRaw,
  }
}
