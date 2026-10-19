// src/app/api/pagar/[token]/evento/route.ts — pública (o token do link é a autorização).
// POST { evento: "estendidos" } → registra para o funil de /alertas. Sempre 204: nada a mostrar ao cliente.
import { NextRequest } from "next/server";
import { registrarEventoLink } from "@/lib/pix-link";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const body = await req.json().catch(() => null);
  if (body?.evento === "estendidos") await registrarEventoLink(token, "estendidos", req.headers.get("user-agent"));
  return new Response(null, { status: 204 });
}
