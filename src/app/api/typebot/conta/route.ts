export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { pool } from "@/lib/db"

// Normaliza para apenas dígitos e remove código do país 55
function cleanPhone(raw: string): string {
  const digits = raw.replace(/@.*$/, "").replace(/\D/g, "")
  // Remove 55 inicial (código Brasil) se tiver 12+ dígitos
  if (digits.length >= 12 && digits.startsWith("55")) return digits.slice(2)
  return digits
}

export async function GET(req: NextRequest) {
  const phone = req.nextUrl.searchParams.get("phone") ?? ""

  if (!phone.trim()) {
    return NextResponse.json({
      encontrado: false,
      nome: "",
      assinaturas: [],
      mensagem: "Número de telefone não identificado. Tente novamente.",
    })
  }

  const telefone = cleanPhone(phone)
  // Também tenta sem o DDD (últimos 9 dígitos) para cobrir cadastros incompletos
  const telefoneSemDDD = telefone.length > 9 ? telefone.slice(-9) : telefone

  try {
    const { rows } = await pool.query<{
      nome: string
      app: string | null
      pacote: string | null
      valor: string | null
      vencimento: string | null
    }>(
      `SELECT DISTINCT ON (a.id_aplicativo)
         cl.nome,
         ap.nome_app                          AS app,
         pac.contrato                         AS pacote,
         pl.valor::text                       AS valor,
         TO_CHAR(a.validade, 'DD/MM/YYYY')   AS vencimento
       FROM public.contatos co
       JOIN public.clientes    cl  ON cl.id_cliente  = co.id_cliente
       JOIN public.aplicativos a   ON a.id_cliente   = co.id_cliente
       LEFT JOIN public.apps   ap  ON ap.id_app      = a.id_app
       LEFT JOIN public.pacote pac ON pac.id_pacote  = a.id_pacote
       LEFT JOIN public.planos pl  ON pl.id_plano    = a.id_plano
       WHERE (
         co.telefone = $1
         OR co.telefone = $2
         OR RIGHT(co.telefone, 9) = $2
       )
         AND a.status    = 'ativa'
         AND a.validade >= CURRENT_DATE
       ORDER BY a.id_aplicativo, a.validade ASC
       LIMIT 5`,
      [telefone, telefoneSemDDD]
    )

    if (rows.length === 0) {
      return NextResponse.json({
        encontrado: false,
        nome: "",
        assinaturas: [],
        mensagem: "Nenhuma conta ativa encontrada para este número.",
      })
    }

    const nome = rows[0].nome
    const assinaturas = rows.map((r) => ({
      app: r.app ?? "—",
      pacote: r.pacote ?? "—",
      valor: r.valor ? `R$ ${r.valor}` : "—",
      vencimento: r.vencimento ?? "—",
    }))

    const linhas = assinaturas
      .map(
        (a, i) =>
          `${i + 1}. *${a.app}* | ${a.pacote} | ${a.valor} — vence ${a.vencimento}`
      )
      .join("\n")
    const mensagem = `📋 *${nome}*, suas assinaturas ativas:\n\n${linhas}`

    return NextResponse.json({ encontrado: true, nome, assinaturas, mensagem })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno"
    console.error("[typebot/conta] Erro:", err)
    return NextResponse.json({
      encontrado: false,
      nome: "",
      assinaturas: [],
      mensagem: "Erro ao consultar os dados. Tente novamente.",
    })
  }
}
