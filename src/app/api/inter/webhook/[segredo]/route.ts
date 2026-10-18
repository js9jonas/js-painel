// src/app/api/inter/webhook/[segredo]/route.ts — aviso de Pix recebido (ver src/lib/pix-webhook.ts).
import { NextRequest } from "next/server";
import { receberAvisoPix } from "@/lib/pix-webhook";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ segredo: string }> }) {
  const { segredo } = await ctx.params;
  return receberAvisoPix(req, segredo);
}
