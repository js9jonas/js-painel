// src/app/api/assinaturas/[id]/renovar/route.ts
import { NextRequest, NextResponse } from "next/server";
import { origemRequisicao } from "@/lib/audit";
import { renovarAssinatura, type Periodo } from "@/lib/renovar-assinatura";

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await ctx.params;
    const idAssinatura = String(rawId).trim();

    const body = await req.json().catch(() => ({}));

    const periodo: Periodo = body?.periodo ?? "mensal";
    const dataManual = typeof body?.dataManual === "string" && body.dataManual.trim()
      ? body.dataManual.trim() : null;
    const registrarPagamento = body?.registrarPagamento === true;
    const pgto = body?.pagamento ?? null;
    const vencContasManual = typeof body?.vencContasManual === "string" && body.vencContasManual.trim()
      ? body.vencContasManual.trim() : null;
    const soPagamento = body?.soPagamento === true;
    // Observação só é gravada quando o campo vem no body (hoje: "Salvar como pendente").
    // Texto vazio limpa a observação.
    const atualizarObservacao = typeof body?.observacao === "string";
    const observacao: string | null = atualizarObservacao ? body.observacao : null;

    // statusFinal: "ativo" | "pendente" | null (null = manter status atual)
    const statusFinal: "ativo" | "pendente" | null = body?.statusFinal ?? null;

    // Rastro pra auditoria: tela de onde veio (/chat, /clientes/[id]) + IP/navegador.
    const telaOrigem = typeof body?.telaOrigem === "string" ? body.telaOrigem.slice(0, 120) : null;
    const origem = { tela: telaOrigem, ...origemRequisicao(req) };

    // Lógica em src/lib/renovar-assinatura.ts (mesma usada pela renovação automática do Pix)
    const r = await renovarAssinatura({
      idAssinatura, periodo, dataManual, registrarPagamento, pagamento: pgto, vencContasManual,
      soPagamento, atualizarObservacao, observacao, statusFinal, origem,
    });
    return NextResponse.json(r.corpo, { status: r.httpStatus });
  } catch (err: any) {
    console.error("Erro ao renovar assinatura:", err);
    return NextResponse.json({ ok: false, error: err?.message ?? "Erro interno" }, { status: 500 });
  }
}