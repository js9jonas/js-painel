import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { pool } from '@/lib/db'
import { enviarTemplateWhatsapp } from '@/lib/whatsapp-template'
import {
  listarPendentes,
  buscarDadosParaEnvio,
  templateDoTipo,
  sourceDoTipo,
  type TipoNotificacaoVencimento,
} from '@/lib/notificacoes-vencimento'

export const dynamic = 'force-dynamic'

function ehTipoValido(tipo: unknown): tipo is TipoNotificacaoVencimento {
  return tipo === 'vencidos' || tipo === 'amanha'
}

function formatarData(d: string): string {
  const dt = new Date(d)
  const dia = String(dt.getUTCDate()).padStart(2, '0')
  const mes = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const ano = dt.getUTCFullYear()
  return `${dia}/${mes}/${ano}`
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const tipo = req.nextUrl.searchParams.get('tipo')
  if (!ehTipoValido(tipo)) {
    return NextResponse.json({ error: "tipo deve ser 'vencidos' ou 'amanha'" }, { status: 400 })
  }

  const itens = await listarPendentes(tipo)
  return NextResponse.json({ itens })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { tipo, ids } = await req.json().catch(() => ({}))
  if (!ehTipoValido(tipo) || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "tipo e ids[] são obrigatórios" }, { status: 400 })
  }

  const templateName = templateDoTipo(tipo)
  const source = sourceDoTipo(tipo)

  const DELAY_ENTRE_CONTATOS_MS = 200

  const resultados: any[] = []
  for (let i = 0; i < ids.length; i++) {
    const idAssinatura: string = ids[i]

    if (i > 0) await new Promise((resolve) => setTimeout(resolve, DELAY_ENTRE_CONTATOS_MS))

    try {
      const dados = await buscarDadosParaEnvio(idAssinatura)
      if (!dados) {
        resultados.push({ id_assinatura: idAssinatura, ok: false, error: 'Assinatura não encontrada' })
        continue
      }
      if (!dados.telefone) {
        resultados.push({ id_assinatura: idAssinatura, nome: dados.nome, ok: false, error: 'Sem telefone cadastrado' })
        continue
      }

      const primeiroNome = dados.nome.trim().split(/\s+/)[0]
      const telasTxt = `${dados.telas} tela${dados.telas > 1 ? 's' : ''}`
      const dataTxt = formatarData(dados.venc_contrato)

      const resultado = await enviarTemplateWhatsapp(dados.telefone, templateName, [primeiroNome, telasTxt, dataTxt])

      if (!resultado.ok) {
        resultados.push({ id_assinatura: idAssinatura, nome: dados.nome, telefone: dados.telefone, ok: false, error: resultado.error })
        continue
      }

      await pool.query(
        `INSERT INTO public.whatsapp_mensagens
          (wa_msg_id, telefone, tipo, conteudo, origem, source, recebida_em)
         VALUES ($1, $2, 'template', $3, 'jonas', $4, NOW())
         ON CONFLICT (wa_msg_id) DO NOTHING`,
        [resultado.msgId, dados.telefone, JSON.stringify({ name: templateName, parametros: [primeiroNome, telasTxt, dataTxt], copyCode: null }), source]
      )

      resultados.push({ id_assinatura: idAssinatura, nome: dados.nome, telefone: dados.telefone, ok: true })
    } catch (err: any) {
      resultados.push({ id_assinatura: idAssinatura, ok: false, error: err?.message ?? 'Erro interno' })
    }
  }

  return NextResponse.json({ resultados })
}
