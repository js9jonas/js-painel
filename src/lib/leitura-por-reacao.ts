import { pool } from '@/lib/db'
import { lerImagemApp, type LeituraImagem } from '@/lib/ler-imagem-app'

// Reação 🔄 do Jonas (pelo celular) numa imagem de cliente → mesma leitura do botão do /chat,
// com o resultado enviado pro Telegram dele. Substitui o envio automático de toda imagem de
// ativação que o n8n fazia (nó "Telegram — Ativação", desativado em 29/09/2026).

export const EMOJI_LER_IMAGEM = '🔄'

const PAINEL_URL = 'https://js-painel.l1fcxz.easypanel.host'

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fmtData(iso: string): string {
  return iso.split('T')[0].split('-').reverse().join('/')
}

function formatarTelefone(tel: string): string {
  const d = tel.replace(/\D/g, '')
  if (d.length === 13) return `(${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`
  if (d.length === 12) return `(${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`
  return tel
}

type BotaoTelegram = { text: string; copy_text?: { text: string }; url?: string }

export function montarMensagem(
  quem: string,
  leitura: LeituraImagem | null,
  erro: string | null,
): { texto: string; botoes: BotaoTelegram[][] } {
  const linhas: string[] = [`🔄 <b>Leitura de imagem</b> — ${esc(quem)}`, '']
  const botoes: BotaoTelegram[][] = []

  if (!leitura) {
    linhas.push(`❌ Não foi possível ler: ${esc(erro ?? 'erro desconhecido')}`)
    return { texto: linhas.join('\n'), botoes }
  }

  const ehEmail = !!leitura.mac?.includes('@')
  if (leitura.app) linhas.push(`📱 <b>${esc(leitura.app)}</b>`)
  if (leitura.mac) linhas.push(`${ehEmail ? 'E-mail' : 'MAC'}: <code>${esc(leitura.mac)}</code>${leitura.mac_suspeito ? ' ⚠️ formato incomum, confira' : ''}`)
  if (leitura.chave) linhas.push(`${ehEmail ? 'Senha' : 'Chave'}: <code>${esc(leitura.chave)}</code>`)
  if (leitura.validade) linhas.push(`Validade: ${fmtData(leitura.validade)}`)
  for (const o of leitura.outros) linhas.push(`${esc(o.rotulo)}: <code>${esc(o.valor)}</code>`)
  if (!leitura.mac && !leitura.chave && leitura.outros.length === 0) linhas.push('Nenhum MAC ou chave encontrado.')
  if (leitura.observacao) linhas.push('', `<i>${esc(leitura.observacao)}</i>`)

  if (leitura.cadastros.length > 0) {
    linhas.push('', '<b>Já cadastrado:</b>')
    for (const c of leitura.cadastros) {
      const app = esc(c.nome_app ?? `App #${c.id_app}`)
      const val = c.validade ? ` · até ${fmtData(c.validade)}` : ''
      if (c.id_cliente == null) linhas.push(`⚠️ ${app} (${esc(c.status ?? '—')}${val}) — registro sem cliente`)
      else if (c.do_contato) linhas.push(`✅ ${app} (${esc(c.status ?? '—')}${val}) — deste cliente`)
      else linhas.push(`⚠️ ${app} (${esc(c.status ?? '—')}${val}) — <b>de outro cliente: ${esc(c.nome_cliente ?? `#${c.id_cliente}`)}</b>`)
    }
  } else if (leitura.pode_cadastrar) {
    linhas.push('', '🆕 MAC novo neste app — dá pra cadastrar pelo /chat ou pelo cliente.')
  }

  // Botão de copiar (copy_text) — até 256 caracteres por valor
  const copiar: BotaoTelegram[] = []
  if (leitura.mac) copiar.push({ text: `📋 ${ehEmail ? 'E-mail' : 'MAC'}`, copy_text: { text: leitura.mac.slice(0, 256) } })
  if (leitura.chave) copiar.push({ text: `📋 ${ehEmail ? 'Senha' : 'Chave'}`, copy_text: { text: leitura.chave.slice(0, 256) } })
  if (copiar.length) botoes.push(copiar)
  if (leitura.id_cliente_conversa) botoes.push([{ text: 'Abrir cliente no js-painel', url: `${PAINEL_URL}/clientes/${leitura.id_cliente_conversa}` }])

  return { texto: linhas.join('\n'), botoes }
}

export async function lerImagemPorReacao(waMsgId: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID_JONAS
  if (!botToken || !chatId) {
    console.error('[leitura-reacao] TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID_JONAS não configurados')
    return
  }

  const { rows } = await pool.query(
    `SELECT m.id::int AS id, m.tipo, m.origem, m.telefone, m.nome_contato, cl.nome AS nome_cliente
     FROM public.whatsapp_mensagens m
     LEFT JOIN public.contatos ct ON ct.telefone = m.telefone
     LEFT JOIN public.clientes cl ON cl.id_cliente = ct.id_cliente
     WHERE m.wa_msg_id = $1 LIMIT 1`,
    [waMsgId]
  )
  const msg = rows[0]
  // Só imagens enviadas pelo cliente — 🔄 em outra mensagem é só uma reação comum
  if (!msg || msg.tipo !== 'image' || msg.origem !== 'cliente') return

  const quem = msg.nome_cliente ?? msg.nome_contato ?? formatarTelefone(msg.telefone)
  const resultado = await lerImagemApp(msg.id)
  const { texto, botoes } = resultado.ok
    ? montarMensagem(quem, resultado.leitura, null)
    : montarMensagem(quem, null, resultado.error)

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: texto,
      parse_mode: 'HTML',
      ...(botoes.length ? { reply_markup: { inline_keyboard: botoes } } : {}),
    }),
  })
  if (!res.ok) {
    console.error(`[leitura-reacao] Telegram ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }
}
