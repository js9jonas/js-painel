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
    novoRotulo  = body?.novoRotulo  !== undefined ? String(body.novoRotulo) : undefined;
    novoUsuario = body?.novoUsuario || undefined;
  } catch {
    return NextResponse.json({ erro: "Body inválido." }, { status: 400 });
  }
  if (!idConta || !usuario) return NextResponse.json({ erro: "Campos obrigatórios ausentes." }, { status: 400 });

  const temMudancaPainel = !!(novaSenha || (novoUsuario && novoUsuario !== usuario));

  // Se há campos que precisam ir ao painel (senha/usuário), chama o adapter primeiro.
  // Só atualiza o banco se o painel aceitar — evita inconsistência com dado inválido salvo.
  if (temMudancaPainel) {
    try {
      const adapter = await getAdapterPainel(idPainel);
      if (typeof adapter.editarConta === "function") {
        const resultado = await adapter.editarConta(usuario, {
          ...(novoUsuario && novoUsuario !== usuario ? { novoUsuario } : {}),
          ...(novaSenha ? { novaSenha } : {}),
          // Rótulo junto para não fazer 2 chamadas
          ...(novoRotulo !== undefined ? { novoRotulo } : {}),
        });
        if (!resultado.ok) {
          return NextResponse.json(
            { erro: resultado.erro ?? "O painel rejeitou a alteração." },
            { status: 422 }
          );
        }
      }
    } catch (e: unknown) {
      return NextResponse.json(
        { erro: e instanceof Error ? e.message : "Erro ao comunicar com o painel." },
        { status: 422 }
      );
    }

    // Painel aceitou — atualiza banco local com todos os campos alterados
    const setClauses: string[] = [];
    const values: unknown[] = [];
    if (novoRotulo !== undefined)            { values.push(novoRotulo || null); setClauses.push(`rotulo = $${values.length}`); }
    if (novaSenha)                           { values.push(novaSenha);          setClauses.push(`senha = $${values.length}`); }
    if (novoUsuario && novoUsuario !== usuario) { values.push(novoUsuario);     setClauses.push(`usuario = $${values.length}`); }
    if (setClauses.length > 0) {
      values.push(idConta);
      await pool.query(`UPDATE public.contas SET ${setClauses.join(", ")} WHERE id_conta = $${values.length}`, values);
    }

    return NextResponse.json({ ok: true, mensagem: "Conta atualizada com sucesso." });
  }

  // Apenas rótulo mudou (campo local) — atualiza banco sem chamar adapter
  if (novoRotulo !== undefined) {
    await pool.query(
      `UPDATE public.contas SET rotulo = $1 WHERE id_conta = $2`,
      [novoRotulo || null, idConta]
    );
  }

  return NextResponse.json({ ok: true, mensagem: "Rótulo atualizado." });
}
