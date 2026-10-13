export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";
import { registrarAudit } from "@/lib/audit";
import { painelSmartOneAtivo, sessaoSmartOne } from "@/lib/app-painel";
import { ID_APP_SMARTONE } from "@/lib/apps-painel-ids";
import { csrfDaSessao, licencaDoMac, transacoesDoMac, transferirLicenca } from "@/lib/painel-adapters/smartone";
import { guardarConferencia } from "@/lib/licencas-sobrando";

// Transfere a licença SmartOne de um aparelho sem uso (origem: cliente que saiu / app inativo) para o
// aparelho desta rota (destino, em /alertas) — economiza giftcode. Regras do site (12/10/2026):
// cada licença transfere UMA vez (some o link "Transfer"); o destino não soma dias (fica com a maior).
// Listas NÃO vão junto (playlists=0): a lista do aparelho antigo é de outro cliente/TV.
// O resultado é conferido nas transações do site, não só na mensagem da página.

type JobState =
  | { done: false; etapa: string }
  | { done: true; ok: true; validade: string | null }
  | { done: true; ok: false; erro: string };
const jobs = new Map<string, JobState>();

type App = { id_app_registro: number; id_app: number; mac: string | null; id_cliente: number | null; nome_cliente: string | null; validade: string | null; observacao: string | null };

async function carregar(id: number): Promise<App | null> {
  const { rows } = await pool.query<App>(
    `SELECT ap.id_app_registro, ap.id_app, ap.mac, ap.id_cliente, cl.nome AS nome_cliente, ap.validade::text, ap.observacao
     FROM public.aplicativos ap LEFT JOIN public.clientes cl ON cl.id_cliente = ap.id_cliente
     WHERE ap.id_app_registro = $1 AND ap.removido_em IS NULL`,
    [id]
  );
  return rows[0] ?? null;
}

const br = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

async function executar(idDestino: number, idOrigem: number, jobId: string) {
  const etapa = (texto: string) => jobs.set(jobId, { done: false, etapa: texto });
  try {
    const [destino, origem] = await Promise.all([carregar(idDestino), carregar(idOrigem)]);
    if (!destino || !origem) throw new Error("Aplicativo não encontrado.");
    if (Number(destino.id_app) !== ID_APP_SMARTONE || Number(origem.id_app) !== ID_APP_SMARTONE) throw new Error("Transferência de licença é só do SmartOne.");
    if (!destino.mac || !origem.mac) throw new Error("Aparelho sem MAC cadastrado.");
    if (destino.mac.trim().toUpperCase() === origem.mac.trim().toUpperCase()) throw new Error("Origem e destino são o mesmo aparelho.");

    const painel = await painelSmartOneAtivo();
    if (!painel) throw new Error("Nenhum painel SmartOne ativo cadastrado.");
    etapa("Entrando no SmartOne…");
    const cookie = await sessaoSmartOne(painel.id);
    const csrf = await csrfDaSessao(cookie);

    etapa("Conferindo a licença de origem…");
    const lic = await licencaDoMac(cookie, origem.mac, csrf);
    if (!lic || !lic.expira_em || lic.expira_em <= new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })) {
      guardarConferencia(origem.mac, { estado: "ok", transferivel: false, expira_em: lic?.expira_em ?? null, em: Date.now() });
      throw new Error("O aparelho de origem não tem licença válida no site.");
    }
    if (!lic.transferivel) {
      guardarConferencia(origem.mac, { estado: "ok", transferivel: false, expira_em: lic.expira_em, em: Date.now() });
      throw new Error("Essa licença não transfere mais (o site só permite transferir uma vez). Escolha outra.");
    }
    const destinoAntes = await licencaDoMac(cookie, destino.mac, csrf).catch(() => null);

    etapa("Transferindo…");
    const r = await transferirLicenca(cookie, origem.mac, destino.mac, false);

    // Confere de verdade: a transação da origem tem que aparecer no destino
    etapa("Conferindo no site…");
    const transacoesDestino = await transacoesDoMac(cookie, destino.mac, csrf);
    const chegou = transacoesDestino.some((t) => t.id === lic.id);
    const validade = transacoesDestino.map((t) => t.expira_em ?? "").sort().at(-1) || null;
    guardarConferencia(origem.mac, null);
    if (!chegou) throw new Error(r.ok ? "O site disse que transferiu, mas a licença não apareceu no aparelho. Confira no site." : `O SmartOne recusou: ${r.erro}`);

    const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    const notaOrigem = `Licença transferida para ${destino.mac}${destino.nome_cliente ? ` (${destino.nome_cliente})` : ""} em ${br(hoje)}`;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE public.aplicativos SET validade = $1::date, status = 'ativa', atualizado_em = NOW() WHERE id_app_registro = $2`,
        [validade, destino.id_app_registro]
      );
      await client.query(
        `UPDATE public.aplicativos
         SET validade = NULL, status = 'inativa', atualizado_em = NOW(),
             observacao = CASE WHEN COALESCE(btrim(observacao), '') = '' THEN $1 ELSE observacao || ' · ' || $1 END
         WHERE id_app_registro = $2`,
        [notaOrigem, origem.id_app_registro]
      );
      await registrarAudit(client, {
        tipo: "alteracao_app",
        id_cliente: destino.id_cliente,
        id_app_registro: destino.id_app_registro,
        descricao: `Licença SmartOne recebida de ${origem.mac}${origem.nome_cliente ? ` (${origem.nome_cliente})` : ""} — sem gastar giftcode`,
        dados_antes: { validade: destino.validade, licenca_site: destinoAntes?.expira_em ?? null },
        dados_depois: { validade, transacao: lic.id, de_mac: origem.mac },
      });
      await registrarAudit(client, {
        tipo: "alteracao_app",
        id_cliente: origem.id_cliente,
        id_app_registro: origem.id_app_registro,
        descricao: notaOrigem,
        dados_antes: { validade: origem.validade },
        dados_depois: { validade: null, transacao: lic.id, para_mac: destino.mac },
      });
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw new Error(`A licença foi transferida no site, mas não ficou salva aqui (${e instanceof Error ? e.message : "erro"}). Rode a sincronização do SmartOne em Conexões.`);
    } finally {
      client.release();
    }

    jobs.set(jobId, { done: true, ok: true, validade });
  } catch (e: unknown) {
    jobs.set(jobId, { done: true, ok: false, erro: e instanceof Error ? e.message : "Erro ao transferir." });
  } finally {
    setTimeout(() => jobs.delete(jobId), 15 * 60 * 1000);
  }
}

// POST { id_origem } — inicia a transferência em segundo plano
export async function POST(req: NextRequest, { params }: { params: Promise<{ idAppRegistro: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const { idAppRegistro } = await params;
  const idDestino = parseInt(idAppRegistro, 10);
  const corpo = await req.json().catch(() => ({}));
  const idOrigem = Number(corpo.id_origem);
  if (!Number.isInteger(idDestino) || !Number.isInteger(idOrigem) || idOrigem <= 0) {
    return NextResponse.json({ erro: "Aparelhos inválidos." }, { status: 400 });
  }
  // Uma transferência por vez para o mesmo destino
  for (const [k, v] of jobs) {
    if (k.startsWith(`transferir-${idDestino}-`) && !v.done) return NextResponse.json({ jobId: k });
  }
  const jobId = `transferir-${idDestino}-${idOrigem}-${Date.now()}`;
  jobs.set(jobId, { done: false, etapa: "Iniciando…" });
  executar(idDestino, idOrigem, jobId).catch(() => {});
  return NextResponse.json({ jobId });
}

// GET ?jobId= — andamento
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const jobId = new URL(req.url).searchParams.get("jobId") ?? "";
  const job = jobs.get(jobId);
  if (!job) return NextResponse.json({ done: false, notFound: true });
  return NextResponse.json(job);
}
