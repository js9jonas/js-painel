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

/** Primeiro nome com só a inicial maiúscula ("JOÃO DA SILVA" → "João"); vazio se não houver nome utilizável. */
function primeiroNome(nome: string | null | undefined): string {
  const primeiro = (nome ?? '').trim().split(/\s+/)[0]?.replace(/[^\p{L}'-]/gu, '') ?? ''
  if (!primeiro) return ''
  return primeiro.charAt(0).toLocaleUpperCase('pt-BR') + primeiro.slice(1).toLocaleLowerCase('pt-BR')
}

/** Frase das telas liberadas, com concordância; sem número de telas cai no genérico "Sua assinatura". */
function fraseTelas(telas: number | null, dataTxt: string, ativa: boolean): string {
  if (!telas) return `Sua assinatura ${ativa ? 'está ativa' : 'segue liberada'} até *${dataTxt}*.`
  if (telas === 1) return `Sua *1 tela* ${ativa ? 'está liberada' : 'segue liberada'} até *${dataTxt}*.`
  return `Suas *${telas} telas* ${ativa ? 'estão liberadas' : 'seguem liberadas'} até *${dataTxt}*.`
}

/**
 * Sem conversa minha com o cliente nesse intervalo, a renovação vai precedida de uma
 * saudação — senão a 1ª mensagem "humana" que ele recebe depois do lembrete automático
 * + Chave PIX automática é a confirmação seca. Pedido do Jonas em 01/10/2026.
 */
const HORAS_SEM_CONVERSA_PARA_SAUDACAO = 6
const PAUSA_ENTRE_SAUDACAO_E_RENOVACAO_MS = 2_000

/** "bom dia" / "boa tarde" / "boa noite" pelo horário de Brasília (o container roda em UTC). */
function periodoDoDia(): string {
  const hora = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hourCycle: 'h23' }))
  if (hora >= 5 && hora < 12) return 'bom dia'
  if (hora >= 12 && hora < 18) return 'boa tarde'
  return 'boa noite'
}

function montarSaudacao(nome: string | null): string {
  const pNome = primeiroNome(nome)
  return `Oi${pNome ? `, ${pNome}` : ''}, ${periodoDoDia()}! 😊\nRecebi seu comprovante, muito obrigado!`
}

/**
 * Conta só o que eu digitei: pelo celular (eco do app, source 'phone') ou pelo /chat
 * ('chat' / 'chat:<email>'). Fica de fora tudo que sai sozinho — resposta automática da
 * Chave PIX, lembretes de vencimento, notificações de renovação, n8n — e os botões do
 * /chat ('chat-planos', 'chat-pagamento'), que são mensagens prontas (decisão do Jonas).
 * Usa o índice (telefone, recebida_em DESC).
 */
async function conversouRecentemente(telefone: string): Promise<boolean> {
  // Acessório: erro aqui não pode derrubar a renovação — na dúvida, sem saudação.
  try {
    return await consultarConversaRecente(telefone)
  } catch (err) {
    console.error('[NotificarRenovacao] Falha ao checar conversa recente, seguindo sem saudação:', err)
    return true
  }
}

async function consultarConversaRecente(telefone: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1
     FROM public.whatsapp_mensagens
     WHERE telefone = $1
       AND origem = 'jonas'
       AND (source = 'phone' OR source = 'chat' OR source LIKE 'chat:%')
       AND recebida_em >= NOW() - make_interval(hours => $2::int)
     LIMIT 1`,
    [telefone, HORAS_SEM_CONVERSA_PARA_SAUDACAO]
  )
  return rows.length > 0
}

function montarTexto(telas: number | null, dataTxt: string, ehNovo: boolean, identificacao: string | null, nome: string | null): string {
  const pNome = primeiroNome(nome)
  const linhaIdentificacao = identificacao ? `🏷️ ${identificacao}\n` : ''
  if (ehNovo) {
    return (
      `🎉 *Seja bem-vindo(a)${pNome ? `, ${pNome}` : ''}!*\n\n` +
      `${fraseTelas(telas, dataTxt, true)} 📺\n` +
      linhaIdentificacao +
      `\nSe tiver qualquer dificuldade pra instalar ou entrar, me chama aqui que eu te ajudo passo a passo 📲\n\n` +
      `Obrigado pela confiança, bom proveito! 😊`
    )
  }
  const cadaUm = telas && telas > 1 ? ', então é só aproveitar, cada um na sua TV' : ', então é só aproveitar'
  return (
    `✅ *Tudo certo${pNome ? `, ${pNome}` : ''}!*\n\n` +
    `Pagamento confirmado. ${fraseTelas(telas, dataTxt, false).replace(/\.$/, '')}${cadaUm}. 📺\n` +
    linhaIdentificacao +
    `\nQualquer coisa que precisar, é só me chamar aqui que eu resolvo 📲\n\n` +
    `Obrigado por seguir com a gente! 🙏`
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

  const nome: string | null = cliente.rows[0].nome
  const dataTxt = novoVencimento ? formatarData(novoVencimento) : '-'
  const texto = montarTexto(telas, dataTxt, ehNovo, identificacao, nome)
  // Depois da saudação o nome já foi dito — a renovação sai sem ele pra não repetir.
  // Boas-vindas não ganha saudação: ela já é uma.
  const saudacao = ehNovo ? null : montarSaudacao(nome)
  const textoAposSaudacao = montarTexto(telas, dataTxt, ehNovo, identificacao, null)

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

  const haviaJanelaAberta = !!telefoneAtivo.rows[0]
  let saudacaoEnviada = false
  if (telefoneAtivo.rows[0]) {
    const telefone = telefoneAtivo.rows[0].telefone
    let textoFinal = texto
    if (saudacao && !(await conversouRecentemente(telefone))) {
      // Saudação é acessória: se falhar, a renovação sai mesmo assim, com o nome.
      const saudacaoId = await enviarTextoWhatsapp(telefone, saudacao)
      await registrarMensagemWhatsapp(saudacaoId, telefone, saudacao, { source: 'notificacao-renovacao-saudacao' })
      if (saudacaoId) {
        saudacaoEnviada = true
        textoFinal = textoAposSaudacao
        await new Promise((r) => setTimeout(r, PAUSA_ENTRE_SAUDACAO_E_RENOVACAO_MS))
      }
    }
    const msgId = await enviarTextoWhatsapp(telefone, textoFinal)
    await registrarMensagemWhatsapp(msgId, telefone, textoFinal, { source: ehNovo ? 'notificacao-boas-vindas' : 'notificacao-renovacao' })
    if (msgId) return { enviado: true, telefone }
    // Falha no envio direto mesmo com janela aberta (já passou pelo retry de erro
    // transitório em enviarTextoWhatsapp) — segue pro fallback Telegram como rede
    // de segurança, mas avisando que o motivo foi outro, não falta de conversa.
  }

  return notificarRenovacaoTelegram({
    idCliente,
    nomeCliente: nome,
    texto,
    // Se a saudação já chegou pelo envio direto, o link leva só a renovação (sem nome).
    textoAposSaudacao: saudacao ? textoAposSaudacao : null,
    saudacao: saudacaoEnviada ? null : saudacao,
    ehNovo,
    haviaJanelaAberta,
  })
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
  textoAposSaudacao,
  saudacao,
  ehNovo,
  haviaJanelaAberta,
}: {
  idCliente: string
  nomeCliente: string | null
  texto: string
  /** Renovação sem o nome, pra ir depois da saudação; preenchido sozinho (sem `saudacao`)
   * quando a saudação já foi entregue pelo envio direto. */
  textoAposSaudacao: string | null
  /** Saudação a acrescentar no início do link se eu não conversei com o cliente nesse
   * telefone nas últimas horas; null quando não se aplica ou já foi entregue. */
  saudacao: string | null
  ehNovo: boolean
  /** true quando a janela de 24h estava aberta mas o envio direto falhou por outro
   * motivo (ex: instabilidade transitória da Meta) — diferencia do caso "sem
   * conversa ativa" na mensagem do Telegram, pra não parecer sempre a mesma causa. */
  haviaJanelaAberta: boolean
}): Promise<NotificarRenovacaoResultado> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID_JONAS
  if (!botToken || !chatId) {
    return { enviado: false, motivo: 'Sem janela de 24h e Telegram não configurado' }
  }

  // Sem restrição de 24h aqui — prefere o telefone com a conversa mais recente entre os
  // cadastrados, mas NÃO exige que exista histórico de mensagem do cliente: um cliente que
  // nunca mandou mensagem nenhuma (comum em cliente novo que só pagou, sem nunca ter
  // conversado) ainda tem telefone cadastrado em contatos, e o link wa.me funciona pra
  // iniciar uma conversa nova, sem precisar de histórico prévio. Exigir histórico aqui fazia
  // essa função desistir em silêncio pra esses clientes — nem o WhatsApp direto (sem janela
  // de 24h) nem o fallback Telegram saíam, e nada indicava a falha (bug real encontrado
  // 05/08/2026, ver project_notificacao_renovacao).
  const { rows } = await pool.query(
    `SELECT ct.telefone
     FROM public.contatos ct
     LEFT JOIN LATERAL (
       SELECT MAX(wm.recebida_em) AS ultima
       FROM public.whatsapp_mensagens wm
       WHERE wm.telefone = ct.telefone AND wm.origem = 'cliente'
     ) hist ON true
     WHERE ct.id_cliente = $1::bigint
     ORDER BY hist.ultima DESC NULLS LAST, ct.criado_em ASC
     LIMIT 1`,
    [idCliente]
  )
  const telefoneRaw: string | undefined = rows[0]?.telefone
  if (!telefoneRaw) {
    return { enviado: false, motivo: 'Cliente sem telefone cadastrado' }
  }

  // O link wa.me só leva um texto: saudação e renovação vão juntas, separadas por linha em branco.
  let textoLink = texto
  if (saudacao && textoAposSaudacao && !(await conversouRecentemente(telefoneRaw))) {
    textoLink = `${saudacao}\n\n${textoAposSaudacao}`
  } else if (!saudacao && textoAposSaudacao) {
    textoLink = textoAposSaudacao
  }

  const digits = telefoneRaw.replace(/\D/g, '')
  const numero = digits.startsWith('55') ? digits : `55${digits}`
  const linkWhatsapp = `https://wa.me/${numero}?text=${encodeURIComponent(textoLink).replace(/!/g, '%21')}`

  // Título e motivo dependem da causa real: falta de janela de 24h é diferente de
  // "tinha janela, mas o envio direto falhou" (ex: instabilidade transitória da
  // Meta) — achado em produção 25/08/2026, a mensagem genérica anterior sempre
  // dizia "sem conversa ativa" mesmo quando o motivo era outro.
  const tituloAcao = ehNovo ? 'Boas-vindas' : 'Renovação'
  const causa = haviaJanelaAberta
    ? 'envio direto falhou (provável instabilidade temporária da Meta), mesmo com conversa ativa'
    : 'sem conversa ativa nas últimas 24h'

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `${ehNovo ? '🎉' : '🔰'} *${tituloAcao} — ${nomeCliente ?? 'cliente'}*\n\n` +
          `${haviaJanelaAberta ? '⚠️ Envio direto falhou (provável instabilidade da Meta), não é falta de conversa ativa.' : 'Sem conversa ativa nas últimas 24h.'}\n\n` +
          `Clique no botão pra abrir o WhatsApp com a mensagem pronta e enviar.`,
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
      return { enviado: false, motivo: 'Falha ao notificar Telegram' }
    }
  } catch (err) {
    console.error('[NotificarRenovacao] Timeout/erro de rede ao notificar Telegram:', err)
    return { enviado: false, motivo: 'Falha ao notificar Telegram' }
  }

  return {
    enviado: false,
    viaTelegram: true,
    motivo: `${causa} — link enviado ao Telegram para envio manual`,
    telefone: telefoneRaw,
  }
}
