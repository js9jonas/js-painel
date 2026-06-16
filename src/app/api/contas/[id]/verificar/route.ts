export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";
import { getAdapterPainel } from "@/lib/painel-adapters";

// Verifica o status real de UMA conta no painel — nenhum adapter atual tem endpoint
// de lookup individual (LIEBE tem GET /customers/{id}, mas ainda precisa da listagem
// completa pra resolver o id pelo username, e só tem 3 contas). Por isso usa
// adapter.listarContas() (bulk, 1 request) + filtra pelo username.
//
// Roda em background (mesmo padrão do renovar-sessao/sync-aplicativos): a listagem em
// si é rápida, mas o relogin pode ser lento em painéis com captcha pesado (CLUB ~7min
// no pior caso) — uma chamada síncrona arriscaria o mesmo timeout de proxy já visto no
// sync de apps.

type ContaAtualizada = { id_conta: number; vencimento: string | null; status: string };

type JobState =
  | { done: false }
  | { done: true; ok: true; atualizados: ContaAtualizada[] }
  | { done: true; ok: false; erro: string };

const jobs = new Map<string, JobState>();

async function executarVerificacao(idConta: number, jobId: string) {
  try {
    const { rows } = await pool.query<{
      usuario: string;
      id_painel_servidor: number | null;
      id_assinatura: number | null;
    }>(
      `SELECT usuario, id_painel_servidor, id_assinatura FROM public.contas WHERE id_conta = $1`,
      [idConta]
    );
    if (!rows.length) {
      jobs.set(jobId, { done: true, ok: false, erro: "Conta não encontrada." });
      return;
    }
    const { usuario, id_painel_servidor: idPainel, id_assinatura: idAssinatura } = rows[0];
    if (!idPainel) {
      jobs.set(jobId, { done: true, ok: false, erro: "Conta sem painel vinculado." });
      return;
    }

    const adapter = await getAdapterPainel(idPainel);
    const contasPainel = await adapter.listarContas();
    const contaPrincipal = contasPainel.find((c) => c.usuario === usuario);
    if (!contaPrincipal) {
      jobs.set(jobId, { done: true, ok: false, erro: `Usuário "${usuario}" não encontrado no painel.` });
      return;
    }

    // Outras contas da MESMA assinatura vinculadas ao MESMO painel já têm o dado fresco
    // disponível nesta mesma listagem (bulk) — atualiza e sinaliza todas juntas, sem custo extra.
    const candidatos = idAssinatura
      ? (
          await pool.query<{ id_conta: number; usuario: string }>(
            `SELECT id_conta, usuario FROM public.contas
             WHERE id_assinatura = $1 AND id_painel_servidor = $2 AND removido_em IS NULL`,
            [idAssinatura, idPainel]
          )
        ).rows
      : [{ id_conta: idConta, usuario }];

    const atualizados: ContaAtualizada[] = [];
    for (const cand of candidatos) {
      const match = contasPainel.find((c) => c.usuario === cand.usuario);
      if (!match) continue;
      await pool.query(
        `UPDATE public.contas SET vencimento_real_painel = $1, status_conta = $2 WHERE id_conta = $3`,
        [match.vencimento, match.status, cand.id_conta]
      );
      atualizados.push({ id_conta: cand.id_conta, vencimento: match.vencimento, status: match.status });
    }

    jobs.set(jobId, { done: true, ok: true, atualizados });
  } catch (e: unknown) {
    jobs.set(jobId, { done: true, ok: false, erro: e instanceof Error ? e.message : "Erro ao verificar." });
  }

  setTimeout(() => jobs.delete(jobId), 15 * 60 * 1000);
}

// POST — inicia o job em background e retorna imediatamente
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const { id } = await params;
  const idConta = parseInt(id, 10);
  if (isNaN(idConta)) return NextResponse.json({ erro: "ID inválido." }, { status: 400 });

  const jobId = `conta-${idConta}-${Date.now()}`;
  jobs.set(jobId, { done: false });

  executarVerificacao(idConta, jobId).catch(() => {});

  return NextResponse.json({ jobId, status: "em_andamento" });
}

// GET — verifica o status do job
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  await params;
  const jobId = new URL(req.url).searchParams.get("jobId") ?? "";
  const job = jobs.get(jobId);
  if (!job) return NextResponse.json({ done: false, notFound: true });
  return NextResponse.json(job);
}
