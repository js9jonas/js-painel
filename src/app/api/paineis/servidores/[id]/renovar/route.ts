export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getAdapterPainel } from "@/lib/painel-adapters";
import { pool } from "@/lib/db";
import { migrarContaPainel } from "@/lib/migrar-painel";

// Job+polling — só usado quando o painel é CENTRAL (renovação via navegador real,
// mais lenta e serializada; ver src/lib/central-browser-queue.ts). Outros painéis
// continuam síncronos como sempre. In-memory — ok pra single instance (Easypanel não
// é serverless, mesmo padrão de renovar-sessao/route.ts).
type JobState =
  | { done: false }
  | { done: true; ok: true; novoVencimento?: string; mensagem: string }
  | { done: true; ok: false; erro: string };

const jobsCentral = new Map<string, JobState>();

async function executarRenovacaoCentral(idPainel: number, usuario: string, jobId: string) {
  try {
    const adapter = await getAdapterPainel(idPainel);
    const resultado = await adapter.renovar(usuario, 1);
    if (!resultado.ok) {
      jobsCentral.set(jobId, { done: true, ok: false, erro: resultado.erro ?? "Falha ao renovar." });
      return;
    }
    if (resultado.novoVencimento) {
      await pool.query(
        `UPDATE public.contas SET vencimento_real_painel = $1, status_conta = 'ok'
         WHERE id_painel_servidor = $2 AND usuario = $3`,
        [resultado.novoVencimento, idPainel, usuario]
      );
    }
    jobsCentral.set(jobId, {
      done: true,
      ok: true,
      novoVencimento: resultado.novoVencimento,
      mensagem: resultado.novoVencimento
        ? `Renovado até ${resultado.novoVencimento.split("-").reverse().join("/")}`
        : "Renovação solicitada com sucesso.",
    });
  } catch (e: unknown) {
    jobsCentral.set(jobId, { done: true, ok: false, erro: e instanceof Error ? e.message : "Erro ao renovar." });
  }
  setTimeout(() => jobsCentral.delete(jobId), 15 * 60 * 1000);
}

// GET — polling do job de renovação CENTRAL
export async function GET(req: NextRequest) {
  const jobId = new URL(req.url).searchParams.get("jobId") ?? "";
  const job = jobsCentral.get(jobId);
  if (!job) return NextResponse.json({ done: false, notFound: true });
  return NextResponse.json(job);
}

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
  const { rows: painelRows } = await pool.query<{ migrar_para_id: number | null; tipo: string }>(
    `SELECT migrar_para_id, tipo FROM public.painel_servidores WHERE id = $1`,
    [idPainel]
  );
  const migrarParaId = painelRows[0]?.migrar_para_id ?? null;

  // CENTRAL: renovação via navegador real, mais lenta e serializada numa fila — pode
  // passar do timeout de borda numa rajada (ex: várias renovações seguidas em /alertas).
  // Job+polling em vez de bloquear a resposta HTTP. Ver central-browser-queue.ts.
  if (painelRows[0]?.tipo === "central") {
    const jobId = `central-${idPainel}-${usuario}-${Date.now()}`;
    jobsCentral.set(jobId, { done: false });
    executarRenovacaoCentral(idPainel, usuario, jobId).catch(() => {});
    return NextResponse.json({ jobId, status: "em_andamento" });
  }

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
