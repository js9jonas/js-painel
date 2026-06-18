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

  const nada = novoRotulo === undefined && !novaSenha && !novoUsuario;
  if (nada) return NextResponse.json({ erro: "Nenhum campo para atualizar." }, { status: 400 });

  const campos = {
    ...(novoUsuario && novoUsuario !== usuario ? { novoUsuario } : {}),
    ...(novaSenha   ? { novaSenha }   : {}),
    ...(novoRotulo !== undefined ? { novoRotulo } : {}),
  };

  let adapter;
  try {
    adapter = await getAdapterPainel(idPainel);
  } catch (e: unknown) {
    return NextResponse.json({ erro: e instanceof Error ? e.message : "Adapter indisponível." }, { status: 400 });
  }

  if (typeof adapter.editarConta === "function") {
    // Adapter com suporte a edição — painel deve confirmar antes do banco ser atualizado
    let resultado;
    try {
      resultado = await adapter.editarConta(usuario, campos);
    } catch (e: unknown) {
      return NextResponse.json(
        { erro: e instanceof Error ? e.message : "Erro ao comunicar com o painel." },
        { status: 422 }
      );
    }
    if (!resultado.ok) {
      return NextResponse.json(
        { erro: resultado.erro ?? "O painel rejeitou a alteração." },
        { status: 422 }
      );
    }
  }
  // Painéis sem editarConta (app panels: funplays, lazerplay, etc.) → atualiza banco local apenas

  // Painel confirmou (ou não tem API de edição) — atualiza banco local
  const setClauses: string[] = [];
  const values: unknown[] = [];
  if (novoRotulo !== undefined)                  { values.push(novoRotulo || null); setClauses.push(`rotulo = $${values.length}`); }
  if (novaSenha)                                 { values.push(novaSenha);          setClauses.push(`senha = $${values.length}`); }
  if (novoUsuario && novoUsuario !== usuario)    { values.push(novoUsuario);        setClauses.push(`usuario = $${values.length}`); }

  if (setClauses.length > 0) {
    values.push(idConta);
    await pool.query(
      `UPDATE public.contas SET ${setClauses.join(", ")} WHERE id_conta = $${values.length}`,
      values
    );
  }

  return NextResponse.json({ ok: true, mensagem: "Conta atualizada com sucesso." });
}
