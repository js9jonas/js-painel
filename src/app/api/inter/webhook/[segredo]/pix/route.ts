// src/app/api/inter/webhook/[segredo]/pix/route.ts — a spec do Bacen manda o aviso em
// "{webhookUrl}/pix"; não está confirmado se o Inter acrescenta o /pix, então as duas URLs respondem.
import { NextRequest } from "next/server";
import { receberAvisoPix } from "@/lib/pix-webhook";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ segredo: string }> }) {
  const { segredo } = await ctx.params;
  return receberAvisoPix(req, segredo);
}
