import { pool } from '@/lib/db'
import { enviarTextoWhatsapp, enviarBotoesWhatsapp, registrarMensagemWhatsapp } from '@/lib/whatsapp-envio'

const PIX_CHAVE = '40827286000106'

// Dados de contas bancárias pra quem prefere não usar PIX — botões "Sicredi"/"Lotérica"/"Banrisul"
// enviados junto com a oferta de outras formas de pagamento (ver /api/whatsapp/enviar-pagamento-botao).
// "Lotérica" deposita na conta Caixa (lotérica é correspondente bancário da Caixa).
const CONTA_SICREDI =
  `🟢 *CONTA SICREDI*\n` +
  `AG: 0179\n` +
  `CC: 19355-0\n\n` +
  `*JONAS EDUARDO SCHEIBE*`

const CONTA_CAIXA =
  `🎰 *CONTA CAIXA*\n` +
  `AG: 3689\n` +
  `OP: 001\n` +
  `CC: 00022669-0\n\n` +
  `*JONAS EDUARDO SCHEIBE*`

const CONTA_BANRISUL =
  `🏛️ *CONTA BANRISUL*\n` +
  `AG: 0191\n` +
  `CC: 390103640-3\n\n` +
  `*JONAS EDUARDO SCHEIBE*`
const TEMPLATES_GATILHO = ['lembrete_vencimento', 'lembrete_vencimento_v2', 'vencido_plano', 'vencido_plano_v2']

// Fonte reconhecida sem ser template Meta aprovado: botão "Planos estendidos" enviado
// manualmente pelo atalho "Planos" do /chat (ver /api/whatsapp/enviar-planos-botao).
const SOURCE_CHAT_PLANOS = 'chat-planos'

async function buscarOrigemTemplate(
  replyToMsgId: string | null
): Promise<{ reconhecido: boolean; idAssinatura: string | null }> {
  if (!replyToMsgId) return { reconhecido: false, idAssinatura: null }

  const orig = await pool.query(
    `SELECT conteudo, tipo, source FROM public.whatsapp_mensagens
     WHERE wa_msg_id = $1 AND (tipo = 'template' OR (tipo = 'interactive' AND source = $2))
     LIMIT 1`,
    [replyToMsgId, SOURCE_CHAT_PLANOS]
  )
  if (!orig.rows[0]) return { reconhecido: false, idAssinatura: null }

  const row = orig.rows[0]
  const parsed = JSON.parse(row.conteudo)

  if (row.tipo === 'interactive') {
    return { reconhecido: row.source === SOURCE_CHAT_PLANOS, idAssinatura: parsed?.id_assinatura ?? null }
  }
  return {
    reconhecido: TEMPLATES_GATILHO.includes(parsed?.name),
    idAssinatura: parsed?.id_assinatura ?? null,
  }
}

async function registrarEnvio(
  waMsgId: string | null,
  telefone: string,
  conteudo: string,
  replyToMsgId: string
) {
  await registrarMensagemWhatsapp(waMsgId, telefone, conteudo, {
    source: 'auto-resposta-suporte',
    replyToMsgId,
  })
}

type AssinaturaEncontrada = {
  primeiroNome: string
  tipo: string
  telas: number
  valorAtual: number
  mesesAtual: number
}

type BuscaAssinatura =
  | { status: 'ok'; dados: AssinaturaEncontrada }
  | { status: 'ambiguo'; primeiroNome: string }
  | { status: 'nao_encontrado' }

// Quando idAssinatura é conhecido (veio junto do template original), busca direto por ele —
// evita adivinhar qual assinatura do cliente motivou o clique quando ele tem mais de uma ativa.
async function buscarAssinaturaCliente(telefone: string, idAssinatura: string | null): Promise<BuscaAssinatura> {
  if (idAssinatura) {
    const r = await pool.query(
      `SELECT c.nome, p.tipo, p.telas, p.valor, p.meses
       FROM public.assinaturas a
       JOIN public.clientes c ON c.id_cliente = a.id_cliente
       JOIN public.planos p ON p.id_plano = a.id_plano
       WHERE a.id_assinatura = $1::bigint
       LIMIT 1`,
      [idAssinatura]
    )
    if (!r.rows[0] || r.rows[0].tipo === 'Cortesia') return { status: 'nao_encontrado' }
    const row = r.rows[0]
    return {
      status: 'ok',
      dados: {
        primeiroNome: row.nome.trim().split(/\s+/)[0],
        tipo: row.tipo,
        telas: row.telas,
        valorAtual: Number(row.valor),
        mesesAtual: Number(row.meses),
      },
    }
  }

  const r = await pool.query(
    `SELECT c.nome, p.tipo, p.telas, p.valor, p.meses
     FROM public.contatos ct
     JOIN public.clientes c ON c.id_cliente = ct.id_cliente
     JOIN public.assinaturas a ON a.id_cliente = c.id_cliente
     JOIN public.planos p ON p.id_plano = a.id_plano
     WHERE ct.telefone = $1 AND p.tipo != 'Cortesia'`,
    [telefone]
  )
  if (r.rows.length === 0) return { status: 'nao_encontrado' }
  if (r.rows.length > 1) {
    return { status: 'ambiguo', primeiroNome: r.rows[0].nome.trim().split(/\s+/)[0] }
  }

  const row = r.rows[0]
  return {
    status: 'ok',
    dados: {
      primeiroNome: row.nome.trim().split(/\s+/)[0],
      tipo: row.tipo,
      telas: row.telas,
      valorAtual: Number(row.valor),
      mesesAtual: Number(row.meses),
    },
  }
}

function textoAmbiguo(primeiroNome: string) {
  return (
    `Oi, ${primeiroNome}! 👋\n\n` +
    `Notei que você tem mais de uma assinatura com a gente — vou identificar qual delas antes de te passar os detalhes certinhos. Já te retorno por aqui! 🙏`
  )
}

function formatValor(v: number) {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
    const origem = await buscarOrigemTemplate(replyToMsgId)
    if (!origem.reconhecido) return

    const busca = await buscarAssinaturaCliente(telefone, origem.idAssinatura)
    if (busca.status === 'nao_encontrado') return

    if (busca.status === 'ambiguo') {
      const texto = textoAmbiguo(busca.primeiroNome)
      const msgId = await enviarTextoWhatsapp(telefone, texto)
      await registrarEnvio(msgId, telefone, texto, cliqueMsgId)
      return
    }

    const valorMensal = formatValor(busca.dados.valorAtual / busca.dados.mesesAtual)
    const texto =
      `Olá, ${busca.dados.primeiroNome}! 👋\n\n` +
      `Para renovar seu plano, o valor mensal é de R$ ${valorMensal}.\n\n` +
      `Você pode:\n` +
      `📌 Enviar o comprovante do PIX (chave CNPJ)\n` +
      `🔄 Ativar a renovação automática mensal (sem precisar mandar comprovante todo mês)\n\n` +
      `Escolha uma opção abaixo:`

    const msgId = await enviarBotoesWhatsapp(telefone, texto, [
      { id: 'chave_pix', title: 'Chave PIX' },
      { id: 'automatico_mensal', title: 'Automático mensal' },
    ])
    await registrarEnvio(msgId, telefone, texto, cliqueMsgId)
    return
  }

  if (botaoClicado === 'Pagamento mensal') {
    const origem = await buscarOrigemTemplate(replyToMsgId)
    if (!origem.reconhecido) return

    const busca = await buscarAssinaturaCliente(telefone, origem.idAssinatura)
    if (busca.status === 'nao_encontrado') return

    if (busca.status === 'ambiguo') {
      const texto = textoAmbiguo(busca.primeiroNome)
      const msgId = await enviarTextoWhatsapp(telefone, texto)
      await registrarEnvio(msgId, telefone, texto, cliqueMsgId)
      return
    }

    const plano = await pool.query(
      `SELECT valor FROM public.planos WHERE tipo = $1 AND telas = $2 AND meses = 1 LIMIT 1`,
      [busca.dados.tipo, busca.dados.telas]
    )
    if (!plano.rows[0]) return

    const texto =
      `Pagamento mensal: R$ ${formatValor(Number(plano.rows[0].valor))} 💰\n\n` +
      `Segue abaixo nossa chave PIX (CNPJ):`
    const msgIdA = await enviarTextoWhatsapp(telefone, texto)
    await registrarEnvio(msgIdA, telefone, texto, cliqueMsgId)

    const msgIdB = await enviarTextoWhatsapp(telefone, PIX_CHAVE)
    await registrarEnvio(msgIdB, telefone, PIX_CHAVE, cliqueMsgId)
    return
  }

  if (botaoClicado === 'Planos estendidos') {
    const origem = await buscarOrigemTemplate(replyToMsgId)
    if (!origem.reconhecido) return

    const busca = await buscarAssinaturaCliente(telefone, origem.idAssinatura)
    if (busca.status === 'nao_encontrado') return

    if (busca.status === 'ambiguo') {
      const texto = textoAmbiguo(busca.primeiroNome)
      const msgId = await enviarTextoWhatsapp(telefone, texto)
      await registrarEnvio(msgId, telefone, texto, cliqueMsgId)
      return
    }

    const opcoes = await pool.query(
      `SELECT descricao, valor FROM public.planos
       WHERE tipo = $1 AND telas = $2
       ORDER BY meses ASC`,
      [busca.dados.tipo, busca.dados.telas]
    )
    if (opcoes.rows.length === 0) return

    const NUMEROS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣']
    const linhas = opcoes.rows
      .map((o, i) => `${NUMEROS[i] ?? '🔹'} ${o.descricao} — R$ ${formatValor(Number(o.valor))}`)
      .join('\n')
    const texto =
      `🗓️ Opções de plano disponíveis:\n\n${linhas}\n\n` +
      `🔑 Envie o comprovante do valor escolhido pela nossa chave PIX (CNPJ) abaixo:`
    const msgIdA = await enviarTextoWhatsapp(telefone, texto)
    await registrarEnvio(msgIdA, telefone, texto, cliqueMsgId)

    const msgIdB = await enviarTextoWhatsapp(telefone, PIX_CHAVE)
    await registrarEnvio(msgIdB, telefone, PIX_CHAVE, cliqueMsgId)
    return
  }

  if (botaoClicado === 'Chave PIX') {
    const msgId = await enviarTextoWhatsapp(telefone, PIX_CHAVE)
    await registrarEnvio(msgId, telefone, PIX_CHAVE, cliqueMsgId)
    return
  }

  if (botaoClicado === 'Sicredi') {
    const msgId = await enviarTextoWhatsapp(telefone, CONTA_SICREDI)
    await registrarEnvio(msgId, telefone, CONTA_SICREDI, cliqueMsgId)
    return
  }

  if (botaoClicado === 'Lotérica') {
    const msgId = await enviarTextoWhatsapp(telefone, CONTA_CAIXA)
    await registrarEnvio(msgId, telefone, CONTA_CAIXA, cliqueMsgId)
    return
  }

  if (botaoClicado === 'Banrisul') {
    const msgId = await enviarTextoWhatsapp(telefone, CONTA_BANRISUL)
    await registrarEnvio(msgId, telefone, CONTA_BANRISUL, cliqueMsgId)
    return
  }

  if (botaoClicado === 'Automático mensal') {
    const textoA =
      'Anotado! ✅\n\n' +
      'Assim que a renovação automática mensal estiver disponível, vamos te avisar com as instruções de ativação.\n\n' +
      'Por enquanto, a renovação deve ser feita enviando o comprovante do PIX pela chave abaixo.'
    const msgIdA = await enviarTextoWhatsapp(telefone, textoA)
    await registrarEnvio(msgIdA, telefone, textoA, cliqueMsgId)

    const msgIdB = await enviarTextoWhatsapp(telefone, PIX_CHAVE)
    await registrarEnvio(msgIdB, telefone, PIX_CHAVE, cliqueMsgId)
    return
  }
}
