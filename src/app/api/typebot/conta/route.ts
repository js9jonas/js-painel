export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"

// Limpa "5551984683468@s.whatsapp.net" → "51984683468"
function cleanPhone(raw: string): string {
  return raw.replace(/@.*$/, "").replace(/^55/, "")
}

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone")

  if (!phone) {
    return NextResponse.json(
      { error: "Parâmetro 'phone' é obrigatório" },
      { status: 400 }
    )
  }

  const telefone = cleanPhone(phone)

  try {
    const { rows } = await pool.query<{
      nome: string
      plano: string | null
      status: string
      vencimento: string | null
    }>(
      `SELECT
         cl.nome,
         ap.nome_app AS plano,
         a.status,
         TO_CHAR(a.validade, 'DD/MM/YYYY') AS vencimento
       FROM public.contatos co
       JOIN public.clientes    cl ON cl.id_cliente = co.id_cliente
       JOIN public.aplicativos a  ON a.id_cliente  = co.id_cliente
       LEFT JOIN public.apps   ap ON ap.id_app     = a.id_app
       WHERE co.telefone = $1
         AND a.status    = 'ativa'
         AND a.validade >= CURRENT_DATE
       ORDER BY a.validade ASC
       LIMIT 5`,
      [telefone]
    )

    if (rows.length === 0) {
      return NextResponse.json({ encontrado: false })
    }

    const nome = rows[0].nome
    const assinaturas = rows.map((r) => ({
      plano: r.plano ?? "—",
      status: "ativa",
      vencimento: r.vencimento ?? "—",
    }))

    const linhas = assinaturas
      .map((a, i) => `${i + 1}. ${a.plano} — vence ${a.vencimento}`)
      .join("\n")
    const mensagem = `📋 *${nome}*, suas assinaturas ativas:\n\n${linhas}`

    return NextResponse.json({ encontrado: true, nome, assinaturas, mensagem })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno"
    console.error("[typebot/conta] Erro:", err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
