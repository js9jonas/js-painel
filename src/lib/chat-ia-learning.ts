// src/lib/chat-ia-learning.ts
//
// Aprendizado incremental do agente de atendimento do /chat — mesmo padrão
// já usado no /agente (lab.agente_dados_aprendizados + extração em background
// via Haiku), mas em lab.chat_ia_aprendizados e com dois gatilhos próprios:
//
// 1. extractLearningFromEdicao  — Jonas editou a sugestão antes de enviar.
//    O diff entre o que a IA sugeriu e o que ele realmente mandou é o sinal
//    mais direto que existe: revela tom, regra de negócio ou situação que a
//    IA não considerou.
// 2. extractLearningFromContexto — Jonas usou o painel "Conversar com o
//    agente" pra dar contexto ou pedir ajuste. A instrução dele já costuma
//    ser quase literalmente um aprendizado reaproveitável.
//
// Ambas rodam fire-and-forget (chamadas com .catch(() => {}), nunca await
// bloqueando a resposta ao usuário) e pedem pro Haiku responder "null" quando
// não há nada generalizável — não queremos salvar fato pontual de um cliente
// específico ("ele já pagou ontem") como se fosse regra geral.
import Anthropic from '@anthropic-ai/sdk'
import { pool } from '@/lib/db'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CATEGORIAS = ['tom_e_estilo', 'regra_negocio', 'situacao_recorrente', 'correcao_factual'] as const
type Categoria = typeof CATEGORIAS[number]

interface Learning {
  categoria: Categoria
  conteudo: string
}

function parseLearning(raw: string): Learning | null {
  const trimmed = raw.trim()
  if (!trimmed || trimmed === 'null') return null
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  try {
    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed.categoria || !parsed.conteudo) return null
    if (!CATEGORIAS.includes(parsed.categoria)) return null
    return { categoria: parsed.categoria, conteudo: parsed.conteudo }
  } catch {
    return null
  }
}

async function saveLearning(learning: Learning, pergunta_origem: string, origem_tipo: 'edicao' | 'contexto_painel'): Promise<void> {
  await pool.query(
    `INSERT INTO lab.chat_ia_aprendizados (categoria, conteudo, pergunta_origem, origem_tipo)
     VALUES ($1, $2, $3, $4)`,
    [learning.categoria, learning.conteudo, pergunta_origem.slice(0, 800), origem_tipo]
  )
}

const CATEGORIAS_DESCRICAO = `
- "tom_e_estilo": preferência de tom, formalidade, gírias, forma de tratar o cliente
- "regra_negocio": política concreta (prazo, desconto, forma de cobrança, condição de renovação)
- "situacao_recorrente": como lidar com um TIPO de situação que provavelmente vai se repetir com outros clientes
- "correcao_factual": a IA assumiu algo errado sobre o sistema/produto e foi corrigida`

export async function extractLearningFromEdicao(sugestaoOriginal: string, mensagemFinal: string, historico: string): Promise<void> {
  try {
    const prompt = `Você está analisando uma sugestão de resposta de atendimento (WhatsApp, revendedor de IPTV no Brasil) que foi EDITADA por Jonas antes de enviar ao cliente.

Contexto da conversa com o cliente:
${historico || '(sem histórico)'}

Sugestão original da IA: "${sugestaoOriginal}"
Texto que Jonas realmente enviou: "${mensagemFinal}"

---

Extraia UM único aprendizado concreto e REAPROVEITÁVEL em situações futuras parecidas — algo sobre como Jonas prefere responder, não um fato específico só deste cliente/momento.
Categorias possíveis:${CATEGORIAS_DESCRICAO}

Se a edição foi só um ajuste estilístico sem padrão generalizável (trocou uma palavra, corrigiu typo, encurtou sem mudar sentido) ou é um fato pontual (ex: "esse cliente específico já pagou"), responda exatamente: null

Se há algo, responda APENAS com este JSON (sem texto antes ou depois):
{"categoria": "tom_e_estilo" | "regra_negocio" | "situacao_recorrente" | "correcao_factual", "conteudo": "aprendizado conciso em 1-2 frases"}`

    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 250,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? ''
    const learning = parseLearning(raw)
    if (!learning) return

    await saveLearning(learning, `Original: "${sugestaoOriginal}" → Enviado: "${mensagemFinal}"`, 'edicao')
  } catch (err) {
    console.error('[ChatIA] Falha ao extrair aprendizado de edição:', err)
  }
}

export async function extractLearningFromContexto(instrucaoJonas: string, sugestaoGerada: string, historico: string): Promise<void> {
  try {
    const prompt = `Jonas (atendente de um revendedor de IPTV no Brasil) deu o seguinte contexto/instrução pro agente de atendimento, durante uma conversa real de WhatsApp:

Contexto da conversa com o cliente:
${historico || '(sem histórico)'}

Instrução de Jonas pro agente: "${instrucaoJonas}"
Sugestão que o agente gerou a partir disso: "${sugestaoGerada}"

---

Extraia UM único aprendizado REAPROVEITÁVEL em situações futuras parecidas — algo que ajudaria o agente a responder melhor sem precisar que Jonas explique de novo.
Categorias possíveis:${CATEGORIAS_DESCRICAO}

Se a instrução foi um fato pontual só daquele cliente/momento (ex: "ele já pagou ontem", "esse aqui é meu primo") e não generaliza pra outras situações, responda exatamente: null

Se há algo, responda APENAS com este JSON (sem texto antes ou depois):
{"categoria": "tom_e_estilo" | "regra_negocio" | "situacao_recorrente" | "correcao_factual", "conteudo": "aprendizado conciso em 1-2 frases"}`

    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 250,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? ''
    const learning = parseLearning(raw)
    if (!learning) return

    await saveLearning(learning, instrucaoJonas, 'contexto_painel')
  } catch (err) {
    console.error('[ChatIA] Falha ao extrair aprendizado de contexto:', err)
  }
}

export async function loadChatLearnings(): Promise<string> {
  try {
    const { rows } = await pool.query<{ categoria: string; conteudo: string }>(`
      SELECT categoria, conteudo
      FROM lab.chat_ia_aprendizados
      WHERE status = 'ativo'
      ORDER BY criado_em DESC
      LIMIT 40
    `)
    if (rows.length === 0) return ''
    const lines = rows.map((r) => `[${r.categoria}] ${r.conteudo}`)
    return `\n## Aprendizados acumulados com o atendimento real\n${lines.join('\n')}`
  } catch {
    return ''
  }
}
