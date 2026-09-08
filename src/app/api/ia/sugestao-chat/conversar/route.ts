// src/app/api/ia/sugestao-chat/conversar/route.ts
//
// Versão "conversável" da sugestão de resposta do /chat: em vez de gerar de
// primeira (sugestao-chat/route.ts, Haiku, um tiro só), aqui Jonas pode dar
// contexto adicional ou pedir ajustes numa sugestão anterior, e o agente
// responde com uma sugestão revisada — usa Sonnet por lidar melhor com
// instrução corretiva em cima do próprio histórico da conversa com o agente.
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { auth } from '@/auth'
import { loadChatLearnings, extractLearningFromContexto } from '@/lib/chat-ia-learning'

export const dynamic = 'force-dynamic'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface ClienteInfo {
  nome: string
  plano?: string | null
  status?: string | null
  vencimento?: string | null
}

interface MensagemAgente {
  role: 'user' | 'assistant'
  content: string
}

function buildSystem(clienteInfo: string, historico: string, learnings: string): string {
  return `Você é um assistente de atendimento ao cliente para a JS Sistemas, um revendedor de IPTV no Brasil.
Você está conversando com Jonas (o atendente) pra ajustar a sugestão de resposta que ele vai enviar ao cliente pelo WhatsApp — não é você quem fala com o cliente diretamente.

Informações do cliente:
${clienteInfo}

Histórico da conversa com o cliente:
${historico || '(sem histórico ainda)'}
${learnings}

## Seu papel
- Jonas pode te dar contexto adicional (algo que você não sabia, uma decisão que ele tomou) ou pedir ajuste numa sugestão anterior sua.
- Sempre responda com uma sugestão de mensagem pronta pra ele enviar ao cliente — curta, cordial, objetiva, em português informal de WhatsApp brasileiro, no máximo 3 frases.
- Se ele só deu contexto (ainda sem sugestão sua na conversa), gere a primeira sugestão já considerando esse contexto.
- Se ele pediu ajuste numa sugestão sua anterior, gere a versão revisada — não repita a mesma coisa, incorpore o que ele pediu de verdade.

## Formato de resposta
Responda SEMPRE em JSON válido, sem texto antes ou depois:
{
  "sugestao": "texto pronto para Jonas enviar ao cliente",
  "comentario": "nota curta e opcional sobre o que você levou em conta ou mudou — 1 frase; omita ou deixe null se for óbvio"
}`
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { historico, cliente, mensagens } = await req.json() as {
      historico?: string
      cliente?: ClienteInfo | null
      mensagens?: MensagemAgente[]
    }

    if (!Array.isArray(mensagens) || mensagens.length === 0) {
      return NextResponse.json({ error: 'mensagens inválido' }, { status: 400 })
    }

    const clienteInfo = cliente ? `
Cliente: ${cliente.nome}
Plano: ${cliente.plano ?? '—'}
Status assinatura: ${cliente.status ?? '—'}
Vencimento: ${cliente.vencimento ?? '—'}
` : 'Cliente não identificado no sistema.'

    const learnings = await loadChatLearnings()
    const system = buildSystem(clienteInfo, historico ?? '', learnings)

    const res = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system,
      messages: mensagens.map((m) => ({ role: m.role, content: m.content })),
    })

    const raw = res.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text?.trim() ?? ''

    let sugestao = ''
    let comentario: string | null = null
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        sugestao = parsed.sugestao ?? ''
        comentario = parsed.comentario ?? null
      }
    } catch {
      // fallthrough — devolve o texto cru como sugestão se o JSON não vier limpo
    }
    if (!sugestao) sugestao = raw

    // A última instrução de Jonas nesta rodada é o sinal mais direto de aprendizado —
    // extrai em background, não bloqueia a resposta.
    const ultimaInstrucao = mensagens.findLast((m) => m.role === 'user')?.content
    if (ultimaInstrucao && sugestao) {
      extractLearningFromContexto(ultimaInstrucao, sugestao, historico ?? '').catch(() => {})
    }

    return NextResponse.json({ sugestao, comentario })
  } catch (err) {
    console.error('[IA] Erro ao conversar sobre sugestão:', err)
    return NextResponse.json({ error: 'Erro ao gerar sugestão' }, { status: 500 })
  }
}
