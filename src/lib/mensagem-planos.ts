// Mensagem de planos com os botões "⚡ Ative na hora" (link de pagamento, renova na hora) e "⏳ Chave PIX"
// (comprovante, confirmação manual). Usada pelo atalho Planos do /chat e pela resposta aos botões "Pagamento mensal"/
// "Planos estendidos" dos templates de vencimento (auto-resposta-suporte.ts) — 19/10/2026.
// Sem import de servidor: o /chat (client component) monta o texto com esta mesma função.

export const BOTOES_PLANOS = [
  { id: 'ativar_na_hora', title: '⚡ Ative na hora' },
  { id: 'chave_pix', title: '⏳ Chave PIX' },
]

export function textoPlanos(o: {
  primeiroNome?: string | null
  identificacao?: string | null
  telas: number | null
  /** Usado quando não se sabe o número de telas (nome do pacote/plano). */
  rotuloPlano?: string | null
  valorMensal: number | null
  /** Cliente pediu os planos estendidos: aponta onde eles estão no link. */
  estendidos?: boolean
}): string {
  const nome = (o.primeiroNome ?? '').trim().split(/\s+/)[0]?.replace(/[^\p{L}'-]/gu, '') ?? ''
  const saudacao = nome
    ? `Oi, ${nome.charAt(0).toLocaleUpperCase('pt-BR')}${nome.slice(1).toLocaleLowerCase('pt-BR')}! 👋\n\n`
    : ''
  const identificacao = o.identificacao?.trim()
  const telasTxt = o.telas == null
    ? (o.rotuloPlano ?? 'sua assinatura')
    : o.telas === 1 ? '1 tela' : `${o.telas} telas`
  const beneficio = o.telas && o.telas > 1 ? ', cada um assistindo na sua TV' : ' pra assistir sem interrupção'
  const valor = o.valorMensal
    ? ` por *${o.valorMensal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês*`
    : ''
  return (
    saudacao +
    `📦 Seu plano${identificacao ? ` *${identificacao}*` : ''}: *${telasTxt}*${valor}${beneficio}.\n\n` +
    (o.estendidos
      ? `🗓️ Os planos de mais meses estão no link: é só tocar em *Planos estendidos* na página.\n\n`
      : '') +
    `✨ *Novidade:* agora a renovação é na hora! Toque em *⚡ Ative na hora*, pague pelo Pix no link seguro da JS Sistemas e pronto: liberado em segundos, sem mandar comprovante 🚀\n\n` +
    `Prefere o jeito de antes? Toque em *⏳ Chave PIX* e me mande o comprovante (confirmação manual, pode levar um tempinho).`
  )
}
