export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getAdapterPainel } from "@/lib/painel-adapters";
import { pool } from "@/lib/db";
import { migrarContaPainel } from "@/lib/migrar-painel";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idPainel = parseInt(id, 10);
  if (isNaN(idPainel)) return NextResponse.json({ erro: "ID inválido." }, { status: 400 });

  let usuario: string;
  try {
    const body = await req.json();
    usuario = body?.usuario;
  } catch {
    return NextResponse.json({ erro: "Body inválido." }, { status: 400 });
  }
  if (!usuario) return NextResponse.json({ erro: "Campo 'usuario' obrigatório." }, { status: 400 });

  // Painel marcado pra descontinuar (ex: CLUB antigo → CLUB novo, ver
  // project_club_migracao_painel): em vez de renovar aqui, migra pro painel de destino
  // automaticamente. Cobre tanto o clique manual "Renovar via API" (/alertas) quanto a
  // renovação automática ao salvar assinatura (RenovarAssinatura.tsx) — os dois passam
  // por esta mesma rota, então um único ponto de checagem resolve ambos.
  const { rows: painelRows } = await pool.query<{ migrar_para_id: number | null }>(
    `SELECT migrar_para_id FROM public.painel_servidores WHERE id = $1`,
    [idPainel]
  );
  const migrarParaId = painelRows[0]?.migrar_para_id ?? null;

  if (migrarParaId) {
    const { rows: contaRows } = await pool.query<{ id_conta: number }>(
      `SELECT id_conta FROM public.contas WHERE id_painel_servidor = $1 AND usuario = $2 AND removido_em IS NULL LIMIT 1`,
      [idPainel, usuario]
    );
    const idConta = contaRows[0]?.id_conta;
    if (!idConta) {
      return NextResponse.json({ erro: `Conta "${usuario}" não encontrada neste painel pra migrar.` }, { status: 404 });
    }

    const resultado = await migrarContaPainel(idConta, migrarParaId);
    if (!resultado.ok) {
      return NextResponse.json({ erro: resultado.erro }, { status: resultado.status });
    }
    return NextResponse.json({
      ok: true,
      migrado: true,
      novoVencimento: resultado.vencimento,
      mensagem: resultado.vencimento
        ? `Migrado pro painel novo — válido até ${resultado.vencimento.split("-").reverse().join("/")}`
        : "Migrado pro painel novo com sucesso.",
    });
  }

  let adapter;
  try {
    adapter = await getAdapterPainel(idPainel);
  } catch (e: unknown) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Adapter indisponível." }, { status: 400 });
  }

  try {
    const resultado = await adapter.renovar(usuario, 1);

    if (!resultado.ok) {
      return NextResponse.json({ erro: resultado.erro ?? "Falha ao renovar." }, { status: 422 });
    }

    if (resultado.novoVencimento) {
      await pool.query(
        `UPDATE public.contas
         SET vencimento_real_painel = $1, status_conta = 'ok'
         WHERE id_painel_servidor = $2 AND usuario = $3`,
        [resultado.novoVencimento, idPainel, usuario]
      );
    }

    return NextResponse.json({
      ok: true,
      novoVencimento: resultado.novoVencimento ?? null,
      mensagem: resultado.novoVencimento
        ? `Renovado até ${resultado.novoVencimento.split("-").reverse().join("/")}`
        : "Renovação solicitada com sucesso.",
    });
  } catch (e: unknown) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Erro ao renovar." }, { status: 422 });
  }
}
