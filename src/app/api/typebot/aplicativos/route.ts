export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"

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
      app: string | null
      status: string
      vencimento: string | null
    }>(
      `SELECT
         cl.nome,
         ap.nome_app                         AS app,
         a.status,
         TO_CHAR(a.validade, 'DD/MM/YYYY')  AS vencimento
       FROM public.contatos co
       JOIN public.clientes    cl ON cl.id_cliente = co.id_cliente
       JOIN public.aplicativos a  ON a.id_cliente  = co.id_cliente
       LEFT JOIN public.apps   ap ON ap.id_app     = a.id_app
       WHERE co.telefone = $1
       ORDER BY a.status ASC, a.validade DESC
       LIMIT 10`,
      [telefone]
    )

    if (rows.length === 0) {
      return NextResponse.json({
        encontrado: false,
        nome: "",
        mensagem: "Nenhum aplicativo encontrado para este número.",
      })
    }

    const nome = rows[0].nome
    const linhas = rows.map((r, i) => {
      const status = r.status === "ativa" ? "✅ ativa" : "❌ expirada"
      const venc = r.vencimento ? ` (vence ${r.vencimento})` : ""
      return `${i + 1}. *${r.app ?? "—"}* — ${status}${venc}`
    })

    const mensagem = `📱 *${nome}*, seus aplicativos cadastrados:\n\n${linhas.join("\n")}`

    return NextResponse.json({ encontrado: true, nome, mensagem })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno"
    console.error("[typebot/aplicativos] Erro:", err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
