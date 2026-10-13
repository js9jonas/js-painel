export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";
import { registrarAudit } from "@/lib/audit";
import { buscarDispositivoPorMac } from "@/lib/painel-adapters/appacesso";
import { buscarDispositivoPorMac as buscarSmartOne } from "@/lib/painel-adapters/smartone";
import { painelAppPorId, painelAtivoDoApp, painelSmartOneAtivo, sessaoPainelApp, sessaoSmartOne, validadeDoPainel } from "@/lib/app-painel";
import { ID_APP_SMARTONE } from "@/lib/apps-painel-ids";

// Atualiza UM aparelho a partir do painel do app (Fun Play / Lazer Play / Core Player / SmartOne): busca
// só esse MAC e copia validade + número interno + painel. Não gasta crédito nem giftcode. Pedido do Jonas
// em 13/10/2026 (caso Joel Conceição): rodar o sync inteiro do painel só para acertar um cadastro é lento.
// Em segundo plano porque o login do painel (captcha) pode levar até ~2 min.

type JobState =
  | { done: false }
  | { done: true; ok: true; validade: string | null; mudou: boolean }
  | { done: true; ok: false; erro: string };
const jobs = new Map<string, JobState>();

type App = { mac: string | null; id_app: number; id_painel_servidor: number | null; id_cliente: number | null; validade: string | null };

async function executar(idAppRegistro: number, jobId: string) {
  try {
    const { rows } = await pool.query<App>(
      `SELECT mac, id_app::int, id_painel_servidor::int, id_cliente::int, validade::text
       FROM public.aplicativos WHERE id_app_registro = $1 AND removido_em IS NULL`,
      [idAppRegistro]
    );
    const app = rows[0];
    if (!app) throw new Error("Aplicativo não encontrado.");
    if (!app.mac) throw new Error("Aplicativo sem MAC cadastrado.");

    let achado: { id: number | string; validade: string | null; idPainel: number; nomePainel: string } | null = null;
    if (app.id_app === ID_APP_SMARTONE) {
      const painel = await painelSmartOneAtivo();
      if (!painel) throw new Error("Nenhum painel SmartOne ativo cadastrado.");
      const dev = await buscarSmartOne(await sessaoSmartOne(painel.id), app.mac);
      if (dev) achado = { id: dev.id, validade: dev.activation_expired, idPainel: painel.id, nomePainel: painel.nome };
      else throw new Error(`O aparelho não está no painel ${painel.nome}. Confira o MAC no site.`);
    } else {
      const painel = (app.id_painel_servidor ? await painelAppPorId(app.id_painel_servidor) : null)
        ?? await painelAtivoDoApp(app.id_app);
      if (!painel) throw new Error("Esse aplicativo não tem painel para consultar.");
      const dev = await buscarDispositivoPorMac(painel.cfg, await sessaoPainelApp(painel), app.mac);
      if (dev) achado = { id: dev.id, validade: validadeDoPainel(dev.activation_expired), idPainel: painel.id, nomePainel: painel.nome };
      else throw new Error(`O aparelho não está no painel ${painel.nome}.`);
    }

    const mudou = achado.validade !== app.validade || Number(app.id_painel_servidor) !== achado.idPainel;
    if (mudou) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE public.aplicativos
           SET validade = $1::date, id_dispositivo_painel = $2, id_painel_servidor = $3, atualizado_em = NOW()
           WHERE id_app_registro = $4`,
          [achado.validade, achado.id, achado.idPainel, idAppRegistro]
        );
        await registrarAudit(client, {
          tipo: "alteracao_app",
          id_cliente: app.id_cliente,
          id_app_registro: idAppRegistro,
          descricao: `Validade atualizada pelo painel ${achado.nomePainel} (só este aparelho)`,
          dados_antes: { validade: app.validade, id_painel_servidor: app.id_painel_servidor },
          dados_depois: { validade: achado.validade, id_painel_servidor: achado.idPainel },
        });
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    }
    jobs.set(jobId, { done: true, ok: true, validade: achado.validade, mudou });
  } catch (e: unknown) {
    jobs.set(jobId, { done: true, ok: false, erro: e instanceof Error ? e.message : "Erro ao consultar o painel." });
  } finally {
    setTimeout(() => jobs.delete(jobId), 15 * 60 * 1000);
  }
}

// POST — inicia a consulta em segundo plano
export async function POST(_req: NextRequest, { params }: { params: Promise<{ idAppRegistro: string }> }) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const id = parseInt((await params).idAppRegistro, 10);
  if (!Number.isInteger(id)) return NextResponse.json({ erro: "Aplicativo inválido." }, { status: 400 });
  for (const [k, v] of jobs) if (k.startsWith(`atualizar-${id}-`) && !v.done) return NextResponse.json({ jobId: k });
  const jobId = `atualizar-${id}-${Date.now()}`;
  jobs.set(jobId, { done: false });
  executar(id, jobId).catch(() => {});
  return NextResponse.json({ jobId });
}

// GET ?jobId= — andamento
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  const job = jobs.get(new URL(req.url).searchParams.get("jobId") ?? "");
  if (!job) return NextResponse.json({ done: false, notFound: true });
  return NextResponse.json(job);
}
