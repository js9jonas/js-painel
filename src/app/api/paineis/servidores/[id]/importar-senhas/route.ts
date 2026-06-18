export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getAdapterPainel } from "@/lib/painel-adapters";
import { pool } from "@/lib/db";

// Endpoint exclusivo para painéis que retornam senhas em chamadas individuais (ex.: CLUB).
// Não deve ser chamado no sync diário — pode demorar minutos e estressar a sessão.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idPainel = parseInt(id, 10);
  if (isNaN(idPainel)) return NextResponse.json({ erro: "ID inválido." }, { status: 400 });

  let adapter;
  try {
    adapter = await getAdapterPainel(idPainel);
  } catch (e: unknown) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Adapter indisponível." }, { status: 400 });
  }

  if (typeof adapter.importarSenhas !== "function") {
    return NextResponse.json({ erro: "Este painel não suporta importação de senhas." }, { status: 400 });
  }

  let senhas: Map<string, string | null>;
  try {
    senhas = await adapter.importarSenhas();
  } catch (e: unknown) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Erro ao importar senhas." }, { status: 422 });
  }

  let atualizadas = 0;
  for (const [usuario, senha] of senhas.entries()) {
    if (!senha) continue;
    const { rowCount } = await pool.query(
      `UPDATE public.contas SET senha = $1
       WHERE id_painel_servidor = $2 AND usuario = $3 AND removido_em IS NULL`,
      [senha, idPainel, usuario]
    );
    if (rowCount) atualizadas++;
  }

  const total = senhas.size;
  const mensagem = total === 0
    ? "Nenhuma senha encontrada — sessão pode ter expirado logo no início."
    : atualizadas === 0
    ? `${total} contas processadas — todas já tinham as senhas atualizadas.`
    : `${atualizadas} senhas salvas de ${total} contas processadas.` +
      (total < 262 ? ` (parcial — sessão expirou em ${total} contas, importe novamente para continuar)` : "");

  return NextResponse.json({ ok: true, total, atualizadas, mensagem });
}
