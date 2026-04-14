// src/app/api/agent/learnings/[id]/discuss/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { auth } from '@/auth'
import { pool } from '@/lib/db'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  const role = (session?.user as { role?: string })?.role
  if (!session?.user || role !== 'admin') {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await ctx.params
  const { messages } = await req.json()

  const { rows } = await pool.query(
    `SELECT id, categoria, conteudo, pergunta_origem FROM lab.agente_dados_aprendizados WHERE id = $1`,
    [id]
  )
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Aprendizado não encontrado' }, { status: 404 })
  }
  const learning = rows[0]

  const CATEGORY_NAMES: Record<string, string> = {
    schema_fact:   'Fato de schema',
    business_rule: 'Regra de negócio',
    query_pattern: 'Padrão de query',
    value_meaning: 'Significado de valor/coluna',
  }

  const system = `Você é um especialista em banco de dados e regras de negócio do sistema JS Painel (gestão de clientes IPTV).

Você está discutindo um aprendizado acumulado pelo agente de análise de dados. Esse aprendizado é injetado no contexto do agente em cada conversa para guiar suas consultas e interpretações.

## Aprendizado atual
Categoria: ${CATEGORY_NAMES[learning.categoria] ?? learning.categoria}
Conteúdo: "${learning.conteudo}"
${learning.pergunta_origem ? `Gerado a partir da pergunta: "${learning.pergunta_origem}"` : ''}

## Seu papel
- Esclarecer o que esse aprendizado significa e por que foi gerado
- Discutir se está correto, incompleto ou impreciso
- Sugerir reformulações mais precisas quando cabível
- Responder dúvidas sobre o domínio (IPTV, estrutura do banco, regras de negócio)

## Formato de resposta
Responda sempre em JSON:
{
  "message": "sua resposta em texto",
  "suggested_update": "nova versão do conteúdo do aprendizado, SE você tiver uma sugestão concreta de melhoria"
}

Se não tiver sugestão de atualização, omita o campo "suggested_update" ou deixe como null.
Seja direto e objetivo. Responda em português.`

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    })

    const raw = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text?.trim() ?? ''

    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return NextResponse.json({
          message: parsed.message ?? raw,
          suggested_update: parsed.suggested_update ?? null,
        })
      }
    } catch {
      // fallthrough
    }
    return NextResponse.json({ message: raw, suggested_update: null })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erro interno'
    console.error('[Discuss] Erro:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
