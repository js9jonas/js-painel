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
         COALESCE(p.descricao, p.tipo) AS plano,
         a.status,
         TO_CHAR(a.venc_contas, 'DD/MM/YYYY') AS vencimento
       FROM public.contatos co
       JOIN public.clientes   cl ON cl.id_cliente = co.id_cliente
       JOIN public.assinaturas a ON a.id_cliente  = co.id_cliente
       LEFT JOIN public.planos p ON p.id_plano    = a.id_plano
       WHERE co.telefone = $1
       ORDER BY a.status = 'ativo' DESC, a.venc_contas DESC`,
      [telefone]
    )

    if (rows.length === 0) {
      return NextResponse.json({ encontrado: false })
    }

    return NextResponse.json({
      encontrado: true,
      nome: rows[0].nome,
      assinaturas: rows.map((r) => ({
        plano: r.plano ?? "—",
        status: r.status,
        vencimento: r.vencimento ?? "—",
      })),
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno"
    console.error("[typebot/conta] Erro:", err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
