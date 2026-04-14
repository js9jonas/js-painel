// src/app/api/agent/chat/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { auth } from '@/auth'
import { pool } from '@/lib/db'
import { STATIC_CONTEXT } from '@/lib/agent-context'

export const dynamic = 'force-dynamic'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Context ─────────────────────────────────────────────────────────────────

async function loadLearnings(): Promise<string> {
  try {
    const { rows } = await pool.query<{ categoria: string; conteudo: string }>(`
      SELECT categoria, conteudo
      FROM lab.agente_dados_aprendizados
      WHERE ativo = true
      ORDER BY criado_em DESC
      LIMIT 60
    `)
    if (rows.length === 0) return ''
    const lines = rows.map((r) => `[${r.categoria}] ${r.conteudo}`)
    return `\n## Aprendizados acumulados\n${lines.join('\n')}`
  } catch {
    return ''
  }
}

function buildSystemPrompt(learnings: string): string {
  return `Você é um assistente de análise de dados do JS Painel, sistema de gestão de clientes IPTV (JS Sistemas, Brasil).

Você tem acesso ao banco de dados PostgreSQL via tools. Use run_query para buscar dados. Use get_schema apenas se precisar de algo não coberto pelo contexto abaixo.

${STATIC_CONTEXT}
${learnings}

IMPORTANTE: Ao dar a resposta final, retorne SOMENTE um JSON válido, sem texto antes ou depois:
{
  "type": "text" | "table" | "bar_chart" | "line_chart" | "pie_chart" | "kpi_cards",
  "message": "explicação textual sempre presente",
  "data": { ... }
}

Formatos de data por tipo:
- table: { "columns": ["col1","col2"], "rows": [[v1,v2], ...] }
- bar_chart / line_chart: { "title": "...", "labels": ["Jan","Fev"], "datasets": [{ "name": "Série", "data": [10,20] }] }
- pie_chart: { "title": "...", "labels": ["A","B"], "datasets": [{ "name": "Total", "data": [30,70] }] }
- kpi_cards: { "cards": [{ "label": "...", "value": 123, "suffix": "opcional" }] }

Prefira retornos estruturados para dados tabulares ou analíticos. Adicione LIMIT nas queries. Responda em português.

## Links para entidades do sistema
Sempre que a resposta referenciar uma entidade específica — em tabela, texto ou kpi_cards — use link Markdown:
- Cliente: [Nome do Cliente](/clientes/{id_cliente})
- Pagamentos filtrados por cliente: [Nome do Cliente](/pagamentos?cliente={id_cliente})

Regras obrigatórias:
- Nunca retorne um id_cliente numérico solto sem contexto — sempre combine com o nome e o link.
- Em colunas de tabela, crie uma coluna "Cliente" com o link, eliminando a coluna de ID bruto.
- Se a query retornar apenas o id sem o nome, faça JOIN com public.clientes para obter o nome.
- No campo "message" do JSON, ao citar um cliente pelo nome, use o link Markdown.`
}

// ─── Tools ───────────────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_schema',
    description: 'Retorna o schema do banco (tabelas e colunas) dos schemas: public, lab, gestao_comunidade. Use apenas se precisar de algo não coberto pelo contexto do sistema.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'run_query',
    description: 'Executa uma consulta SELECT no PostgreSQL. Apenas SELECTs são permitidos. Use LIMIT para limitar resultados. Retorna no máximo 200 linhas.',
    input_schema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'Consulta SQL SELECT a executar' },
      },
      required: ['sql'],
    },
  },
]

function isSafeQuery(sql: string): boolean {
  const trimmed = sql.trim()
  if (!/^SELECT\s/i.test(trimmed)) return false
  const dangerous = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|GRANT|REVOKE|EXECUTE|EXEC|CALL|COPY|DO|BEGIN|COMMIT|ROLLBACK|SET\s+ROLE|SET\s+SESSION)\b/i
  return !dangerous.test(trimmed)
}

async function toolGetSchema(): Promise<string> {
  const { rows } = await pool.query(`
    SELECT c.table_schema, c.table_name, c.column_name, c.data_type
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema IN ('public', 'lab', 'gestao_comunidade') AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_schema, c.table_name, c.ordinal_position
  `)
  const schema: Record<string, Record<string, string[]>> = {}
  for (const row of rows) {
    if (!schema[row.table_schema]) schema[row.table_schema] = {}
    if (!schema[row.table_schema][row.table_name]) schema[row.table_schema][row.table_name] = []
    schema[row.table_schema][row.table_name].push(`${row.column_name}(${row.data_type})`)
  }
  let result = ''
  for (const [s, tables] of Object.entries(schema)) {
    result += `\nSchema ${s}:\n`
    for (const [t, cols] of Object.entries(tables)) result += `  ${t}: ${cols.join(', ')}\n`
  }
  return result || 'Nenhuma tabela encontrada.'
}

async function toolRunQuery(sql: string): Promise<string> {
  if (!isSafeQuery(sql)) {
    return JSON.stringify({ error: 'Apenas consultas SELECT são permitidas.' })
  }
  try {
    const { rows } = await pool.query(sql)
    const limited = rows.slice(0, 200)
    return JSON.stringify({ rows: limited, total: rows.length, truncated: rows.length > 200 })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro ao executar query'
    return JSON.stringify({ error: msg })
  }
}

// ─── Learning extraction ──────────────────────────────────────────────────────

// Roda em background (fire & forget) — não bloqueia a resposta ao usuário
async function extractAndSaveLearning(
  question: string,
  agentAnswer: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  conversationWithTools: any[]
): Promise<void> {
  try {
    const toolSummary = conversationWithTools
      .filter((m) => m.role === 'user' && Array.isArray(m.content))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .flatMap((m) => m.content as any[])
      .filter((b) => b.type === 'tool_result')
      .map((b: { content: string }) => b.content)
      .join('\n---\n')
      .slice(0, 6000)

    const extractPrompt = `Você analisou dados de um banco PostgreSQL para responder a seguinte pergunta:
"${question}"

Dados encontrados nas queries:
${toolSummary || '(sem dados de tools)'}

Sua resposta foi:
${agentAnswer}

---

Extraia UM único aprendizado concreto e reaproveitável desta interação — algo que ajudaria futuras consultas similares.
Pode ser: uma regra de negócio descoberta, um padrão de query útil, o significado de um valor de coluna, ou uma correção de interpretação.

Se não há nada novo e relevante para aprender, responda exatamente: null

Se há algo, responda APENAS com este JSON (sem texto antes ou depois):
{
  "categoria": "schema_fact" | "business_rule" | "query_pattern" | "value_meaning",
  "conteudo": "aprendizado conciso em 1-2 frases"
}`

    const res = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{ role: 'user', content: extractPrompt }],
    })

    const raw = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text?.trim()
    if (!raw || raw === 'null') return

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return

    const learning = JSON.parse(jsonMatch[0]) as { categoria: string; conteudo: string }
    if (!learning.categoria || !learning.conteudo) return

    await pool.query(
      `INSERT INTO lab.agente_dados_aprendizados (categoria, conteudo, pergunta_origem)
       VALUES ($1, $2, $3)`,
      [learning.categoria, learning.conteudo, question.slice(0, 500)]
    )
  } catch (err) {
    console.error('[Agent] Falha ao extrair aprendizado:', err)
  }
}

// ─── Response helper ──────────────────────────────────────────────────────────

function extractFinalResponse(content: Anthropic.ContentBlock[]): NextResponse {
  const textBlock = content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  const rawText = textBlock?.text?.trim() ?? ''
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return NextResponse.json(parsed)
    }
  } catch {
    // fallthrough
  }
  return NextResponse.json({ type: 'text', message: rawText || 'Sem resposta.' })
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    const role = (session?.user as { role?: string })?.role
    if (!session?.user || role !== 'admin') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    const { messages } = await req.json()
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages inválido' }, { status: 400 })
    }

    const [learnings] = await Promise.all([loadLearnings()])
    const systemPrompt = buildSystemPrompt(learnings)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const currentMessages: any[] = messages.map((m: { role: string; content: string }) => ({
      role: m.role,
      content: m.content,
    }))

    const userQuestion = messages.findLast((m: { role: string }) => m.role === 'user')?.content ?? ''
    const MAX_ITERATIONS = 12

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: systemPrompt,
        tools: TOOLS,
        messages: currentMessages,
      })

      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      )

      if (response.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
        const result = extractFinalResponse(response.content)
        const answerText = (await result.clone().json()).message ?? ''
        extractAndSaveLearning(userQuestion, answerText, currentMessages).catch(() => {})
        return result
      }

      currentMessages.push({ role: 'assistant', content: response.content })

      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const toolUse of toolUseBlocks) {
        let result: string
        if (toolUse.name === 'get_schema') {
          result = await toolGetSchema()
        } else if (toolUse.name === 'run_query') {
          const input = toolUse.input as { sql: string }
          result = await toolRunQuery(input.sql)
        } else {
          result = JSON.stringify({ error: 'Tool desconhecida' })
        }
        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result })
      }

      currentMessages.push({ role: 'user', content: toolResults })
    }

    // Limite atingido: forçar resposta final com os dados já coletados
    const forced = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        ...currentMessages,
        {
          role: 'user',
          content: 'Com base nos dados já coletados acima, forneça a resposta final em JSON agora. Não faça mais consultas.',
        },
      ],
    })
    const result = extractFinalResponse(forced.content)
    const answerText = (await result.clone().json()).message ?? ''
    extractAndSaveLearning(userQuestion, answerText, currentMessages).catch(() => {})
    return result

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro interno'
    console.error('[Agent] Erro:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
