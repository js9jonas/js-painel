export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";
import { registrarAudit } from "@/lib/audit";
import { ativarDispositivo, buscarDispositivoPorMac } from "@/lib/painel-adapters/appacesso";
import { painelAppPorId, painelAtivoDoApp, painelSmartOneAtivo, sessaoPainelApp, sessaoSmartOne, validadeDoPainel } from "@/lib/app-painel";
import { ID_APP_SMARTONE } from "@/lib/apps-painel-ids";
import {
  ativarDispositivo as ativarSmartOne,
  buscarDispositivoPorMac as buscarSmartOne,
} from "@/lib/painel-adapters/smartone";

// Ativa o aparelho no painel do app (Fun Play / Lazer Play / Core Player) — GASTA 1 CRÉDITO (pacote
// Anual, id 1, o único do painel em 11/10/2026). Usado em /alertas pros aparelhos cadastrados sem
// ativação (cadastro novo via add existing). A validade gravada é a que o painel devolve.
//
// Proteção contra gasto em dobro (toque duplo, aba antiga): se o painel já mostra validade a mais de
// 40 dias, não ativa de novo — só copia a validade pro js-painel.
//
// SmartOne (12/10/2026): mesma tela e mesma proteção, mas gasta 1 GIFTCODE ("Unused" em client_codes).

const DIAS_JA_ATIVADO = 40;

type JobState =
  | { done: false }
  | { done: true; ok: true; validade: string | null; jaAtivado: boolean }
  | { done: true; ok: false; erro: string };
const jobs = new Map<string, JobState>();

async function executar(idAppRegistro: number, jobId: string) {
  try {
    const { rows } = await pool.query<{
      mac: string | null; id_app: number; id_painel_servidor: number | null; id_cliente: number | null;
      validade: string | null; nome_cliente: string | null;
    }>(
      `SELECT ap.mac, ap.id_app, ap.id_painel_servidor, ap.id_cliente, ap.validade::text, cl.nome AS nome_cliente
       FROM public.aplicativos ap
       LEFT JOIN public.clientes cl ON cl.id_cliente = ap.id_cliente
       WHERE ap.id_app_registro = $1 AND ap.removido_em IS NULL`,
      [idAppRegistro]
    );
    const app = rows[0];
    if (!app) throw new Error("Aplicativo não encontrado.");
    if (!app.mac) throw new Error("Aplicativo sem MAC cadastrado.");

    if (Number(app.id_app) === ID_APP_SMARTONE) {
      const r = await renovarSmartOne(app.mac, app.nome_cliente);
      await gravar(idAppRegistro, app, r.validade, r.idDispositivo, r.idPainel, r.jaAtivado
        ? `Renovação no painel ${r.nomePainel} não feita: já estava ativado; validade copiada do painel`
        : `Renovado no painel ${r.nomePainel} (1 giftcode)`);
      jobs.set(jobId, { done: true, ok: true, validade: r.validade, jaAtivado: r.jaAtivado });
      return;
    }

    const painel = (app.id_painel_servidor ? await painelAppPorId(Number(app.id_painel_servidor)) : null)
      ?? await painelAtivoDoApp(Number(app.id_app));
    if (!painel) throw new Error("Esse aplicativo não tem ativação pelo painel.");

    const token = await sessaoPainelApp(painel);
    const antes = await buscarDispositivoPorMac(painel.cfg, token, app.mac);
    if (!antes) throw new Error(`O aparelho não está no painel ${painel.nome}. Cadastre ele primeiro (Novo aplicativo).`);

    const expiraAntes = antes.activation_expired ? Date.parse(antes.activation_expired) : 0;
    const jaAtivado = expiraAntes > Date.now() + DIAS_JA_ATIVADO * 86_400_000;

    let validade: string | null;
    if (jaAtivado) {
      validade = validadeDoPainel(antes.activation_expired);
    } else {
      const devolvida = await ativarDispositivo(painel.cfg, token, antes.mac, 1, app.nome_cliente ?? undefined);
      const depois = await buscarDispositivoPorMac(painel.cfg, token, antes.mac).catch(() => null);
      validade = validadeDoPainel(depois?.activation_expired) ?? devolvida;
    }

    await gravar(idAppRegistro, app, validade, antes.id, painel.id, jaAtivado
      ? `Ativação no painel ${painel.nome} não feita: já estava ativado; validade copiada do painel`
      : `Ativado no painel ${painel.nome} (1 crédito, pacote Anual)`);

    jobs.set(jobId, { done: true, ok: true, validade, jaAtivado });
  } catch (e: unknown) {
    jobs.set(jobId, { done: true, ok: false, erro: e instanceof Error ? e.message : "Erro ao ativar no painel." });
  } finally {
    setTimeout(() => jobs.delete(jobId), 15 * 60 * 1000);
  }
}

type AppAtivar = { id_cliente: number | null; validade: string | null };

async function gravar(
  idAppRegistro: number, app: AppAtivar, validade: string | null,
  idDispositivo: number | string, idPainel: number, descricao: string
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE public.aplicativos
       SET validade = $1::date, id_dispositivo_painel = $2, id_painel_servidor = $3, status = 'ativa', atualizado_em = NOW()
       WHERE id_app_registro = $4`,
      [validade, idDispositivo, idPainel, idAppRegistro]
    );
    await registrarAudit(client, {
      tipo: "alteracao_app",
      id_cliente: app.id_cliente,
      id_app_registro: idAppRegistro,
      descricao,
      dados_antes: { validade: app.validade },
      dados_depois: { validade },
    });
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// SmartOne: confere a validade no painel (aba active/pending pelo MAC) e só gasta giftcode se não
// estiver ativado a mais de DIAS_JA_ATIVADO. A validade gravada é a que o painel mostra depois.
async function renovarSmartOne(mac: string, nomeCliente: string | null) {
  const painel = await painelSmartOneAtivo();
  if (!painel) throw new Error("Nenhum painel SmartOne ativo cadastrado.");
  const cookie = await sessaoSmartOne(painel.id);

  const antes = await buscarSmartOne(cookie, mac);
  if (!antes) throw new Error(`O aparelho não está no painel ${painel.nome}. Confira o MAC${nomeCliente ? ` de ${nomeCliente}` : ""} no site.`);
  const expiraAntes = antes.activation_expired ? Date.parse(antes.activation_expired) : 0;
  const jaAtivado = expiraAntes > Date.now() + DIAS_JA_ATIVADO * 86_400_000;

  let validade = antes.activation_expired;
  if (!jaAtivado) {
    let devolvida: string;
    try {
      devolvida = await ativarSmartOne(cookie, antes.mac);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message.replace(/^SmartOne: /, "") : "";
      throw new Error(/giftcode dispon/i.test(msg) ? "Sem giftcode disponível no SmartOne. Compre mais no painel antes de renovar." : `O SmartOne recusou a renovação${msg ? ` (${msg})` : ""}.`);
    }
    const depois = await buscarSmartOne(cookie, antes.mac).catch(() => null);
    validade = depois?.activation_expired ?? devolvida;
  }
  return { validade, jaAtivado, idDispositivo: antes.id, idPainel: painel.id, nomePainel: painel.nome };
}

// POST — inicia a ativação em segundo plano
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ idAppRegistro: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });

  const { idAppRegistro } = await params;
  const id = parseInt(idAppRegistro, 10);
  if (isNaN(id)) return NextResponse.json({ erro: "ID inválido." }, { status: 400 });

  // Uma ativação por aparelho por vez (segundo clique enquanto a primeira roda não gasta outro crédito).
  for (const [k, v] of jobs) {
    if (k.startsWith(`ativar-${id}-`) && !v.done) return NextResponse.json({ jobId: k });
  }
  const jobId = `ativar-${id}-${Date.now()}`;
  jobs.set(jobId, { done: false });
  executar(id, jobId).catch(() => {});
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
