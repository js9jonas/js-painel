// src/app/api/clientes/[id]/link-pagamento/route.ts — link /pagar do cliente (cria o token na 1ª vez).
import { NextRequest, NextResponse } from "next/server";
import { obterLinkCliente } from "@/lib/pix-link";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d{1,18}$/.test(id)) return NextResponse.json({ erro: "ID inválido." }, { status: 400 });
  try {
    return NextResponse.json({ link: await obterLinkCliente(id) });
  } catch (err) {
    console.error("[link-pagamento]", err instanceof Error ? err.message : err);
    return NextResponse.json({ erro: "Não foi possível gerar o link." }, { status: 500 });
  }
}
