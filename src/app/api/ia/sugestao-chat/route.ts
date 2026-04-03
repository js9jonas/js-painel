// src/app/api/ia/sugestao-chat/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { historico, cliente } = await req.json()

    const clienteInfo = cliente ? `
Cliente: ${cliente.nome}
Plano: ${cliente.plano ?? '—'}
Status assinatura: ${cliente.status ?? '—'}
Vencimento: ${cliente.vencimento ?? '—'}
` : 'Cliente não identificado no sistema.'

    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: `Você é um assistente de atendimento ao cliente para a JS Sistemas, um revendedor de IPTV no Brasil.
Seu papel é sugerir respostas curtas, cordiais e objetivas para o atendente Jonas responder aos clientes no WhatsApp.
Responda APENAS com o texto da sugestão — sem aspas, sem explicações, sem prefixos como "Sugestão:" ou "Resposta:".
Use linguagem natural e informal, adequada ao WhatsApp brasileiro.
Seja direto e conciso. Máximo de 3 frases.`,
      messages: [{
        role: 'user',
        content: `Informações do cliente:
${clienteInfo}

Histórico da conversa:
${historico}

Sugira uma resposta para Jonas enviar ao cliente.`
      }]
    })

    const sugestao = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''

    return NextResponse.json({ sugestao })
  } catch (err) {
    console.error('[IA] Erro ao gerar sugestão:', err)
    return NextResponse.json({ error: 'Erro ao gerar sugestão' }, { status: 500 })
  }
}