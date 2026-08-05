export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";
import { getAdapterPainel } from "@/lib/painel-adapters";

// POST /api/contas/[id]/migrar-painel  body: { idPainelDestino: number }
// Migra a conta pra outro painel do mesmo tipo (ex: CLUB antigo → CLUB novo): exclui da origem
// e recria no destino com o mesmo usuário/senha, mantendo telas/conteúdo adulto/rótulo.
// ⚠️ Se a exclusão na origem funcionar mas a criação no destino falhar, a conta fica só excluída
// (não existe em nenhum painel) — o erro retornado nesse caso inclui usuário/senha capturados
// pra permitir recriação manual imediata.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const { id: idConta } = await params;
  const id = parseInt(idConta, 10);
  if (isNaN(id)) return NextResponse.json({ erro: "ID inválido." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const idPainelDestino = parseInt(body.idPainelDestino, 10);
  if (isNaN(idPainelDestino)) return NextResponse.json({ erro: "idPainelDestino inválido." }, { status: 400 });

  const { rows } = await pool.query<{ usuario: string; senha: string | null; rotulo: string | null; id_painel_servidor: number | null }>(
    `SELECT usuario, senha, rotulo, id_painel_servidor FROM public.contas WHERE id_conta = $1 AND removido_em IS NULL`,
    [id]
  );
  if (!rows.length) return NextResponse.json({ erro: "Conta não encontrada." }, { status: 404 });

  const { usuario, senha: senhaBanco, rotulo: rotuloBanco, id_painel_servidor: idPainelOrigem } = rows[0];

  if (!idPainelOrigem) {
    return NextResponse.json({ erro: "Conta sem painel de origem vinculado." }, { status: 422 });
  }
  if (idPainelOrigem === idPainelDestino) {
    return NextResponse.json({ erro: "Painel de destino é igual ao de origem." }, { status: 422 });
  }

  // Valida os dois adapters ANTES de mexer em qualquer coisa no painel
  let adapterOrigem, adapterDestino;
  try {
    adapterOrigem = await getAdapterPainel(idPainelOrigem);
    adapterDestino = await getAdapterPainel(idPainelDestino);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao carregar painéis.";
    return NextResponse.json({ erro: msg }, { status: 502 });
  }
  if (!adapterOrigem.deletarConta) {
    return NextResponse.json({ erro: "Exclusão via API não suportada no painel de origem." }, { status: 422 });
  }
  if (!adapterDestino.criarConta) {
    return NextResponse.json({ erro: "Criação via API não suportada no painel de destino." }, { status: 422 });
  }

  // Busca detalhes reais no painel de origem (senha atualizada, telas, conteúdo adulto) — o banco
  // local pode não ter tudo (ex: senha nunca importada, telas nunca sincronizadas).
  let detalhes = null;
  try {
    detalhes = adapterOrigem.obterDetalhes ? await adapterOrigem.obterDetalhes(usuario) : null;
  } catch { /* segue com o que tem no banco se a busca falhar */ }

  const senha = detalhes?.senha ?? senhaBanco;
  if (!senha) {
    return NextResponse.json({ erro: "Conta sem senha conhecida (nem no banco, nem no painel) — importe a senha antes de migrar." }, { status: 422 });
  }
  const telas = detalhes?.telas ?? 1;
  const comAdultos = detalhes?.comAdultos ?? false;
  const rotulo = detalhes?.rotulo || rotuloBanco || "";

  // Ponto de não-retorno: exclui da origem
  try {
    await adapterOrigem.deletarConta(usuario);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao excluir no painel de origem.";
    return NextResponse.json({ erro: msg }, { status: 502 });
  }

  // Cria no destino
  try {
    const resultado = await adapterDestino.criarConta(usuario, senha, { meses: 1, telas, comAdultos, rotulo });
    if (!resultado.ok) {
      return NextResponse.json({
        erro: `Conta excluída da origem mas NÃO criada no destino: ${resultado.erro ?? "erro desconhecido"}. Usuário "${usuario}" / senha "${senha}" — recrie manualmente.`,
      }, { status: 502 });
    }

    await pool.query(
      `UPDATE public.contas SET id_painel_servidor = $1, vencimento_real_painel = $2, status_conta = 'ok' WHERE id_conta = $3`,
      [idPainelDestino, resultado.vencimento ?? null, id]
    );

    return NextResponse.json({ ok: true, vencimento: resultado.vencimento ?? null });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro ao criar no painel de destino.";
    return NextResponse.json({
      erro: `Conta excluída da origem mas NÃO criada no destino: ${msg}. Usuário "${usuario}" / senha "${senha}" — recrie manualmente.`,
    }, { status: 502 });
  }
}
