export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { pool } from "@/lib/db";
import { registrarAudit } from "@/lib/audit";
import { painelAtivoDoApp, painelSmartOneAtivo, sessaoPainelApp, sessaoSmartOne, validadeDoPainel } from "@/lib/app-painel";
import { APPS_COM_TRANSFERENCIA_PAINEL, ID_APP_SMARTONE } from "@/lib/apps-painel-ids";
import {
  adicionarExistente,
  buscarDispositivoPorMac,
  editarComentario,
  transferirLicenca as transferirLicencaPainel,
  validarMac,
} from "@/lib/painel-adapters/appacesso";
import { csrfDaSessao, licencaDoMac, transacoesDoMac, transferirLicenca } from "@/lib/painel-adapters/smartone";
import { DIAS_MINIMOS_TRANSFERENCIA_PAINEL, guardarConferencia } from "@/lib/licencas-sobrando";

// Transfere a licença SmartOne de um aparelho sem uso (origem: cliente que saiu / app inativo) para o
// aparelho desta rota (destino, em /alertas) — economiza giftcode. Regras do site (12/10/2026):
// cada licença transfere UMA vez (some o link "Transfer"); o destino não soma dias (fica com a maior).
// Listas NÃO vão junto (playlists=0): a lista do aparelho antigo é de outro cliente/TV.
// O resultado é conferido nas transações do site, não só na mensagem da página.
//
// Fun Play (13/10/2026, teste real do Jonas): PUT /reseller/device/transfer { from_id, to_id }. Só aceita
// destino SEM licença paga (aparelho novo, em teste) — serve no lugar do "add existing device" + crédito.
// Origem precisa estar no painel ativo e ter 30+ dias. O destino fica com a data da origem (não soma).

type JobState =
  | { done: false; etapa: string }
  | { done: true; ok: true; validade: string | null }
  | { done: true; ok: false; erro: string };
const jobs = new Map<string, JobState>();

type App = { id_app_registro: number; id_app: number; mac: string | null; chave: string | null; id_cliente: number | null; nome_cliente: string | null; validade: string | null; observacao: string | null };

async function carregar(id: number): Promise<App | null> {
  const { rows } = await pool.query<App>(
    `SELECT ap.id_app_registro, ap.id_app::int, ap.mac, ap.chave, ap.id_cliente, cl.nome AS nome_cliente, ap.validade::text, ap.observacao
     FROM public.aplicativos ap LEFT JOIN public.clientes cl ON cl.id_cliente = ap.id_cliente
     WHERE ap.id_app_registro = $1 AND ap.removido_em IS NULL`,
    [id]
  );
  return rows[0] ?? null;
}

const br = (d: string | null) => (d ? d.split("-").reverse().join("/") : "—");

const hojeBr = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

async function executar(idDestino: number, idOrigem: number, jobId: string) {
  const etapa = (texto: string) => jobs.set(jobId, { done: false, etapa: texto });
  try {
    const [destino, origem] = await Promise.all([carregar(idDestino), carregar(idOrigem)]);
    if (!destino || !origem) throw new Error("Aplicativo não encontrado.");
    if (Number(destino.id_app) !== Number(origem.id_app)) throw new Error("Origem e destino são de aplicativos diferentes.");
    if (!destino.mac || !origem.mac) throw new Error("Aparelho sem MAC cadastrado.");
    if (destino.mac.trim().toUpperCase() === origem.mac.trim().toUpperCase()) throw new Error("Origem e destino são o mesmo aparelho.");

    const d = destino as AppComMac, o = origem as AppComMac;
    let validade: string | null;
    if (Number(destino.id_app) === ID_APP_SMARTONE) validade = await executarSmartOne(d, o, etapa);
    else if (APPS_COM_TRANSFERENCIA_PAINEL.includes(Number(destino.id_app))) validade = await executarPainel(d, o, etapa);
    else throw new Error("Esse aplicativo não tem transferência de licença.");

    jobs.set(jobId, { done: true, ok: true, validade });
  } catch (e: unknown) {
    jobs.set(jobId, { done: true, ok: false, erro: e instanceof Error ? e.message : "Erro ao transferir." });
  } finally {
    setTimeout(() => jobs.delete(jobId), 15 * 60 * 1000);
  }
}

type Etapa = (texto: string) => void;
type AppComMac = App & { mac: string };

/** Grava nos dois aparelhos (destino recebe a validade; origem fica inativa com nota) + auditoria. */
async function gravarTransferencia(
  destino: App,
  origem: App,
  validade: string | null,
  nomeApp: string,
  extraDestino: { id_painel_servidor?: number; id_dispositivo_painel?: number; descricao: string; dados_antes: Record<string, unknown>; dados_depois: Record<string, unknown> },
  dadosOrigem: Record<string, unknown>
) {
  const notaOrigem = `Licença transferida para ${destino.mac}${destino.nome_cliente ? ` (${destino.nome_cliente})` : ""} em ${br(hojeBr())}`;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE public.aplicativos
       SET validade = $1::date, status = 'ativa', atualizado_em = NOW(),
           id_painel_servidor = COALESCE($3, id_painel_servidor),
           id_dispositivo_painel = COALESCE($4, id_dispositivo_painel)
       WHERE id_app_registro = $2`,
      [validade, destino.id_app_registro, extraDestino.id_painel_servidor ?? null, extraDestino.id_dispositivo_painel ?? null]
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
      descricao: extraDestino.descricao,
      dados_antes: extraDestino.dados_antes,
      dados_depois: extraDestino.dados_depois,
    });
    await registrarAudit(client, {
      tipo: "alteracao_app",
      id_cliente: origem.id_cliente,
      id_app_registro: origem.id_app_registro,
      descricao: notaOrigem,
      dados_antes: { validade: origem.validade },
      dados_depois: { validade: null, para_mac: destino.mac, ...dadosOrigem },
    });
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw new Error(`A licença foi transferida no ${nomeApp}, mas não ficou salva aqui (${e instanceof Error ? e.message : "erro"}). Rode a sincronização do ${nomeApp} em Conexões.`);
  } finally {
    client.release();
  }
}

async function executarPainel(destino: AppComMac, origem: AppComMac, etapa: Etapa): Promise<string | null> {
  const painel = await painelAtivoDoApp(Number(destino.id_app));
  if (!painel) throw new Error("Nenhum painel ativo cadastrado para esse aplicativo.");
  const nomeApp = painel.cfg.nomeApp;
  etapa(`Entrando no painel ${painel.nome}…`);
  const token = await sessaoPainelApp(painel);

  // Origem: tem que estar no painel ativo, com licença de 30+ dias
  etapa("Conferindo a licença de origem…");
  const devOrigem = await buscarDispositivoPorMac(painel.cfg, token, origem.mac);
  if (!devOrigem) throw new Error("O aparelho de origem não está mais no seu painel. Escolha outro.");
  const validadeOrigem = validadeDoPainel(devOrigem.activation_expired);
  const diasOrigem = validadeOrigem
    ? Math.round((new Date(validadeOrigem + "T00:00:00").getTime() - new Date(hojeBr() + "T00:00:00").getTime()) / 86_400_000)
    : -1;
  if (diasOrigem < DIAS_MINIMOS_TRANSFERENCIA_PAINEL) {
    throw new Error(diasOrigem < 0
      ? "O aparelho de origem não tem mais licença válida no painel. Escolha outro."
      : `Essa licença tem só ${diasOrigem} dias; o ${nomeApp} só transfere com ${DIAS_MINIMOS_TRANSFERENCIA_PAINEL} dias ou mais. Escolha outra.`);
  }

  // Destino: aparelho novo, sem licença paga (o número interno vem do validate_mac, mesmo fora do painel)
  etapa("Conferindo o aparelho de destino…");
  let valDestino;
  try {
    valDestino = await validarMac(painel.cfg, token, destino.mac);
  } catch {
    throw new Error(`O ${nomeApp} não encontrou o MAC deste aparelho. Confira se o aplicativo já foi aberto na TV.`);
  }
  if (valDestino.payed) {
    throw new Error(`Este aparelho já tem licença paga no ${nomeApp}, e ele só transfere para aparelho novo (em teste). Use "Renovar no painel".`);
  }

  // Vai direto pelo número interno, sem "add existing" antes (pedido do Jonas). Ainda não testado com
  // aparelho fora do painel: se recusar e o aparelho estiver fora, traz pro painel (grátis) e tenta 1x mais.
  etapa("Transferindo…");
  try {
    await transferirLicencaPainel(painel.cfg, token, devOrigem.id, valDestino.id);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message.replace(/^[^:]+ API: /, "") : "";
    const recusa = new Error(`O ${nomeApp} recusou a transferência${msg ? `: ${msg}` : ""}.`);
    const jaNoPainel = await buscarDispositivoPorMac(painel.cfg, token, valDestino.mac || destino.mac).catch(() => null);
    if (jaNoPainel || !destino.chave || (valDestino.auth_type && valDestino.auth_type !== "device_key")) throw recusa;
    etapa("Trazendo o aparelho para o painel e tentando de novo…");
    await adicionarExistente(painel.cfg, token, valDestino.mac || destino.mac, destino.chave).catch(() => { throw recusa; });
    await transferirLicencaPainel(painel.cfg, token, devOrigem.id, valDestino.id).catch((e2: unknown) => {
      const msg2 = e2 instanceof Error ? e2.message.replace(/^[^:]+ API: /, "") : "";
      throw new Error(`O ${nomeApp} recusou a transferência${msg2 ? `: ${msg2}` : ""}. O aparelho ficou no seu painel, sem ativação.`);
    });
  }

  // Confere de verdade: o destino tem que ter virado pago
  etapa("Conferindo no painel…");
  const depois = await validarMac(painel.cfg, token, destino.mac).catch(() => null);
  if (!depois?.payed) throw new Error(`O ${nomeApp} aceitou o pedido, mas o aparelho de destino não aparece como ativado. Confira no painel.`);

  // Deixa o aparelho no nosso painel (sync e renovação dependem disso) com o nome do cliente.
  // Se a transferência não o trouxe, usa o add existing — já pago, não gasta crédito.
  const avisos: string[] = [];
  let devDestino = await buscarDispositivoPorMac(painel.cfg, token, depois.mac || destino.mac);
  if (!devDestino && destino.chave) {
    await adicionarExistente(painel.cfg, token, depois.mac || destino.mac, destino.chave).catch(() => null);
    devDestino = await buscarDispositivoPorMac(painel.cfg, token, depois.mac || destino.mac);
  }
  if (!devDestino) avisos.push("aparelho fora do painel");
  else if (destino.nome_cliente) await editarComentario(painel.cfg, token, devDestino.id, destino.nome_cliente).catch(() => null);

  // Data do destino: a do painel; se ele não estiver no painel, a da origem (regra: não soma)
  const validade = validadeDoPainel(devDestino?.activation_expired) ?? validadeOrigem;

  await gravarTransferencia(
    destino,
    origem,
    validade,
    nomeApp,
    {
      id_painel_servidor: devDestino ? painel.id : undefined,
      id_dispositivo_painel: devDestino?.id,
      descricao: `Licença ${nomeApp} recebida de ${origem.mac}${origem.nome_cliente ? ` (${origem.nome_cliente})` : ""} — sem gastar crédito`,
      dados_antes: { validade: destino.validade, payed: false },
      dados_depois: { validade, de_mac: origem.mac, de_id_painel: devOrigem.id, para_id_painel: valDestino.id, avisos },
    },
    { validade_painel: validadeOrigem, id_painel: devOrigem.id }
  );
  return validade;
}

async function executarSmartOne(destino: AppComMac, origem: AppComMac, etapa: Etapa): Promise<string | null> {
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

  await gravarTransferencia(
    destino,
    origem,
    validade,
    "SmartOne",
    {
      descricao: `Licença SmartOne recebida de ${origem.mac}${origem.nome_cliente ? ` (${origem.nome_cliente})` : ""} — sem gastar giftcode`,
      dados_antes: { validade: destino.validade, licenca_site: destinoAntes?.expira_em ?? null },
      dados_depois: { validade, transacao: lic.id, de_mac: origem.mac },
    },
    { transacao: lic.id }
  );
  return validade;
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
