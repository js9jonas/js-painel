import { pool } from '@/lib/db'

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID
const PIX_CHAVE = '40827286000106'
const TEMPLATES_GATILHO = ['lembrete_vencimento', 'vencido_plano']

async function enviarTexto(telefone: string, texto: string): Promise<string | null> {
  const response = await fetch(`https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: telefone,
      type: 'text',
      text: { body: texto },
    }),
  })

  const data = await response.json()
  if (!response.ok) {
    console.error('[AutoResposta] Erro ao enviar texto:', data)
    return null
  }
  return data.messages?.[0]?.id ?? null
}

async function enviarBotoes(
  telefone: string,
  texto: string,
  botoes: { id: string; title: string }[]
): Promise<string | null> {
  const response = await fetch(`https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: telefone,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: texto },
        action: { buttons: botoes.map((b) => ({ type: 'reply', reply: b })) },
      },
    }),
  })

  const data = await response.json()
  if (!response.ok) {
    console.error('[AutoResposta] Erro ao enviar botões:', data)
    return null
  }
  return data.messages?.[0]?.id ?? null
}

async function registrarEnvio(
  waMsgId: string | null,
  telefone: string,
  conteudo: string,
  replyToMsgId: string
) {
  if (!waMsgId) return
  await pool.query(
    `INSERT INTO public.whatsapp_mensagens
      (wa_msg_id, telefone, tipo, conteudo, origem, source, reply_to_wa_msg_id, recebida_em)
     VALUES ($1, $2, 'text', $3, 'jonas', 'auto-resposta-suporte', $4, NOW())
     ON CONFLICT (wa_msg_id) DO NOTHING`,
    [waMsgId, telefone, conteudo, replyToMsgId]
  )
}

async function buscarClienteEPlano(telefone: string) {
  const r = await pool.query(
    `SELECT c.nome, p.valor, p.meses
     FROM public.contatos ct
     JOIN public.clientes c ON c.id_cliente = ct.id_cliente
     JOIN public.assinaturas a ON a.id_cliente = c.id_cliente
     JOIN public.planos p ON p.id_plano = a.id_plano
     WHERE ct.telefone = $1 AND a.status IN ('ativo', 'atrasado', 'pendente')
     ORDER BY a.venc_contrato DESC
     LIMIT 1`,
    [telefone]
  )
  if (!r.rows[0]) return null

  const primeiroNome = r.rows[0].nome.trim().split(/\s+/)[0]
  const valorMensal = (Number(r.rows[0].valor) / Number(r.rows[0].meses)).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return { primeiroNome, valorMensal }
}

interface RespostaSuporteParams {
  telefone: string
  cliqueMsgId: string
  botaoClicado: string
  replyToMsgId: string | null
}

export async function responderFalarComSuporte(params: RespostaSuporteParams) {
  const { telefone, cliqueMsgId, botaoClicado, replyToMsgId } = params

  const jaRespondido = await pool.query(
    `SELECT 1 FROM public.whatsapp_mensagens
     WHERE reply_to_wa_msg_id = $1 AND source = 'auto-resposta-suporte' LIMIT 1`,
    [cliqueMsgId]
  )
  if ((jaRespondido.rowCount ?? 0) > 0) return

  if (botaoClicado === 'Falar com suporte') {
    if (!replyToMsgId) return

    const orig = await pool.query(
      `SELECT conteudo FROM public.whatsapp_mensagens WHERE wa_msg_id = $1 AND tipo = 'template' LIMIT 1`,
      [replyToMsgId]
    )
    const nomeTemplate = orig.rows[0] ? JSON.parse(orig.rows[0].conteudo)?.name : null
    if (!TEMPLATES_GATILHO.includes(nomeTemplate)) return

    const cliente = await buscarClienteEPlano(telefone)
    if (!cliente) return

    const texto =
      `Olá, ${cliente.primeiroNome}! 👋\n\n` +
      `Para renovar seu plano, o valor mensal é de R$ ${cliente.valorMensal}.\n\n` +
      `Você pode:\n` +
      `📌 Enviar o comprovante do PIX (chave CNPJ)\n` +
      `🔄 Ativar a renovação automática mensal (sem precisar mandar comprovante todo mês)\n\n` +
      `Escolha uma opção abaixo:`

    const msgId = await enviarBotoes(telefone, texto, [
      { id: 'chave_pix', title: 'Chave PIX' },
      { id: 'automatico_mensal', title: 'Automático mensal' },
    ])
    await registrarEnvio(msgId, telefone, texto, cliqueMsgId)
    return
  }

  if (botaoClicado === 'Chave PIX') {
    const msgId = await enviarTexto(telefone, PIX_CHAVE)
    await registrarEnvio(msgId, telefone, PIX_CHAVE, cliqueMsgId)
    return
  }

  if (botaoClicado === 'Automático mensal') {
    const textoA =
      'Anotado! ✅\n\n' +
      'Assim que a renovação automática mensal estiver disponível, vamos te avisar com as instruções de ativação.\n\n' +
      'Por enquanto, a renovação deve ser feita enviando o comprovante do PIX pela chave abaixo.'
    const msgIdA = await enviarTexto(telefone, textoA)
    await registrarEnvio(msgIdA, telefone, textoA, cliqueMsgId)

    const msgIdB = await enviarTexto(telefone, PIX_CHAVE)
    await registrarEnvio(msgIdB, telefone, PIX_CHAVE, cliqueMsgId)
    return
  }
}
