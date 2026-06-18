export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getAdapterPainel } from "@/lib/painel-adapters";
import { pool } from "@/lib/db";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idPainel = parseInt(id, 10);
  if (isNaN(idPainel)) return NextResponse.json({ erro: "ID inválido." }, { status: 400 });

  let idConta: number, usuario: string, novaSenha: string | undefined, novoRotulo: string | undefined, novoUsuario: string | undefined;
  try {
    const body = await req.json();
    idConta     = body?.idConta;
    usuario     = body?.usuario;
    novaSenha   = body?.novaSenha   || undefined;
    novoRotulo  = body?.novoRotulo  !== undefined ? String(body.novoRotulo)  : undefined;
    novoUsuario = body?.novoUsuario || undefined;
  } catch {
    return NextResponse.json({ erro: "Body inválido." }, { status: 400 });
  }
  if (!idConta || !usuario) return NextResponse.json({ erro: "Campos obrigatórios ausentes." }, { status: 400 });

  // Tenta chamar o adapter (não bloqueia se não tiver editarConta)
  let erroAdapter: string | null = null;
  try {
    const adapter = await getAdapterPainel(idPainel);
    if (typeof adapter.editarConta === "function") {
      const resultado = await adapter.editarConta(usuario, {
        ...(novoUsuario && novoUsuario !== usuario ? { novoUsuario } : {}),
        ...(novaSenha  ? { novaSenha }  : {}),
        ...(novoRotulo !== undefined ? { novoRotulo } : {}),
      });
      if (!resultado.ok) erroAdapter = resultado.erro ?? "Adapter retornou erro.";
    }
  } catch (e: unknown) {
    erroAdapter = e instanceof Error ? e.message : "Erro no adapter.";
  }

  // Atualiza banco local sempre (mesmo se adapter falhou)
  const setClauses: string[] = [];
  const values: unknown[] = [];

  if (novoRotulo !== undefined) {
    values.push(novoRotulo || null);
    setClauses.push(`rotulo = $${values.length}`);
  }
  if (novaSenha) {
    values.push(novaSenha);
    setClauses.push(`senha = $${values.length}`);
  }
  if (novoUsuario && novoUsuario !== usuario) {
    values.push(novoUsuario);
    setClauses.push(`usuario = $${values.length}`);
  }

  if (setClauses.length > 0) {
    values.push(idConta);
    await pool.query(
      `UPDATE public.contas SET ${setClauses.join(", ")} WHERE id_conta = $${values.length}`,
      values
    );
  }

  if (erroAdapter) {
    return NextResponse.json({
      ok: true,
      aviso: `Banco local atualizado, mas o painel retornou erro: ${erroAdapter}`,
    });
  }

  return NextResponse.json({ ok: true, mensagem: "Conta atualizada com sucesso." });
}
