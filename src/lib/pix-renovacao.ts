// src/lib/pix-renovacao.ts — fase 2 do link de pagamento (18/10/2026): o que fazer com cada
// assinatura paga pelo Pix. Regra do Jonas (corrigida no mesmo dia):
// - o CONTRATO renova sempre, em qualquer data, igual ao botão Renovar (banco + pagamento INTER +
//   histórico + aviso no WhatsApp); pendente vira ativa;
// - a CONTA no painel do fornecedor só renova se estiver vencida ou vencendo hoje;
// - sem conta vinculada ou qualquer empecilho → aviso no Telegram (⚠️).
// Só não renova (vai pra /alertas com o motivo) quando há sinal de erro no pagamento: valor diferente,
// pagamento em dobro, assinatura inativa/cancelada.
//
// Usa as MESMAS funções do botão: renovarAssinatura (banco), datasPadraoDoBotao (datas) e
// renovarContaNoPainel (painel do fornecedor, com as travas dos adapters).
//
// Roda logo depois da confirmação do Pix e no job de 5 min (retenta o que ficou pra trás). Cada item
// é "pego" com uma trava no banco (processando_desde), então dois processos nunca renovam o mesmo.
import { pool } from "@/lib/db";
import { renovarAssinatura } from "@/lib/renovar-assinatura";
import { renovarContaNoPainel } from "@/lib/renovar-conta-painel";
import { datasPadraoDoBotao, periodoDosMeses, contaPrecisaRenovarNoPainel, type Periodo } from "@/lib/datas-renovacao";
import { URL_PAINEL } from "@/lib/enderecos";

/** Aparece como "quem fez" no histórico do cliente (audit_log). */
export const USUARIO_AUTOMATICO = "pix-automatico";
/** Só processa Pix pago nesse intervalo — Pix mais antigo que sobrou vai pra /alertas à mão. */
const JANELA_DIAS = 3;
/** Trava de um item "pego" por um processo que caiu no meio: depois disso outro pode pegar. */
const TRAVA_MINUTOS = 15;

type ItemPago = {
  id_cobranca: string;
  id_assinatura: string;
  valor: string;
  meses: number;
  id_cliente: string;
  txid: string;
  valor_cobrado: string;
  valor_pago: string | null;
};

type DadosAssinatura = {
  status: string | null;
  venc_contrato: string | null;
  venc_contas: string | null;
  nome_cliente: string;
  pacote_contrato: string | null;
  rotulo: string;
  pagamento_depois_do_pix: boolean;
};

export type Decisao =
  | { acao: "renovar"; periodo: Periodo; pendente: boolean }
  | { acao: "alertas"; motivo: string };

/** Regra (sem banco, pra ficar fácil de testar e de ler). Datas em AAAA-MM-DD. */
export function decidir(p: {
  status: string | null;
  vencContrato: string | null;
  meses: number;
  valorCobrado: string;
  valorPago: string | null;
  pagamentoDepoisDoPix: boolean;
  hoje: string;
}): Decisao {
  if (p.valorPago === null || Number(p.valorPago) !== Number(p.valorCobrado)) {
    return { acao: "alertas", motivo: "Valor pago diferente do cobrado" };
  }
  if (p.pagamentoDepoisDoPix) {
    return { acao: "alertas", motivo: "Já tinha pagamento registrado depois de gerar o Pix (pagou em dobro?)" };
  }
  const periodo = periodoDosMeses(p.meses);
  if (!periodo) return { acao: "alertas", motivo: `Período de ${p.meses} meses não reconhecido` };

  const status = (p.status ?? "").toLowerCase().trim();
  if (status === "pendente") return { acao: "renovar", periodo, pendente: true };
  if (status !== "ativo" && status !== "atrasado") {
    return { acao: "alertas", motivo: `Assinatura com status "${p.status ?? "—"}"` };
  }
  // Qualquer data (adiantado também): o botão soma o período ao vencimento atual, ou a partir de
  // hoje se o vencimento das contas já passou / não houver vencimento.
  return { acao: "renovar", periodo, pendente: false };
}

type ResultadoConta = {
  usuario: string;
  painel: string;
  /** renovada | valida (não precisou) | erro | atencao (precisa de alguém) */
  situacao: "renovada" | "valida" | "erro" | "atencao";
  mensagem: string;
};

export type ResultadoItem = {
  rotulo: string;
  acao: "renovado" | "alertas";
  motivo: string | null;
  vencContrato?: string | null;
  whatsapp?: unknown;
  contas?: ResultadoConta[];
  /** Empecilhos depois de renovar o contrato (sem conta, conta com erro...). Viram ⚠️ no Telegram. */
  atencao?: string[];
};

async function hojeBrasilia(): Promise<string> {
  const { rows } = await pool.query<{ d: string }>(`SELECT CURRENT_DATE::text AS d`); // pool usa America/Sao_Paulo
  return rows[0].d;
}

async function lerAssinatura(item: ItemPago): Promise<DadosAssinatura | null> {
  const { rows } = await pool.query<DadosAssinatura>(
    `SELECT a.status, a.venc_contrato::text, a.venc_contas::text, cl.nome AS nome_cliente,
            pc.contrato::text AS pacote_contrato,
            COALESCE(NULLIF(btrim(a.identificacao), ''),
                     CONCAT(pl.tipo, ' ', pl.telas, CASE WHEN pl.telas = 1 THEN ' tela' ELSE ' telas' END)) AS rotulo,
            EXISTS (
              SELECT 1 FROM public.pagamentos pg
              JOIN public.pix_cobrancas c ON c.id = $2::bigint
              WHERE pg.id_assinatura = a.id_assinatura AND pg.atualizado_em >= c.criado_em
            ) AS pagamento_depois_do_pix
     FROM public.assinaturas a
     JOIN public.clientes cl ON cl.id_cliente = a.id_cliente
     LEFT JOIN public.pacote pc ON pc.id_pacote = a.id_pacote
     LEFT JOIN public.planos pl ON pl.id_plano = a.id_plano
     WHERE a.id_assinatura = $1::bigint`,
    [item.id_assinatura, item.id_cobranca]
  );
  return rows[0] ?? null;
}

async function processarItem(item: ItemPago, hoje: string): Promise<ResultadoItem> {
  const a = await lerAssinatura(item);
  if (!a) return { rotulo: `#${item.id_assinatura}`, acao: "alertas", motivo: "Assinatura não encontrada" };

  const decisao = decidir({
    status: a.status,
    vencContrato: a.venc_contrato,
    meses: item.meses,
    valorCobrado: item.valor_cobrado,
    valorPago: item.valor_pago,
    pagamentoDepoisDoPix: a.pagamento_depois_do_pix,
    hoje,
  });
  if (decisao.acao === "alertas") return { rotulo: a.rotulo, acao: "alertas", motivo: decisao.motivo };

  // 1) Banco: as mesmas datas e a mesma função do botão Renovar (forma INTER, valor do item)
  const datas = datasPadraoDoBotao({
    vencContrato: a.venc_contrato,
    vencContas: a.venc_contas,
    periodo: decisao.periodo,
    pendente: decisao.pendente,
    hoje,
  });
  const r = await renovarAssinatura({
    idAssinatura: item.id_assinatura,
    periodo: decisao.periodo,
    dataManual: datas.dataManual,
    registrarPagamento: true,
    pagamento: {
      idCliente: item.id_cliente,
      nomeCliente: a.nome_cliente,
      pacoteNome: a.pacote_contrato,
      forma: "INTER",
      valor: item.valor,
    },
    vencContasManual: datas.vencContasManual,
    soPagamento: decisao.pendente,
    atualizarObservacao: false,
    observacao: null,
    statusFinal: "ativo",
    origem: { tela: "pix-link-automatico", txid: item.txid },
    usuarioAuditoria: USUARIO_AUTOMATICO,
  });
  if (r.httpStatus !== 200 || r.corpo.ok === false) {
    return { rotulo: a.rotulo, acao: "alertas", motivo: `Falha ao renovar: ${r.corpo.error ?? `HTTP ${r.httpStatus}`}` };
  }

  // 2) Painel do fornecedor: contas da assinatura vencidas até hoje, como o botão faz depois de salvar.
  //    Todas as contas da assinatura entram na conta (inclusive sem painel integrado), pra avisar.
  const { rows: contas } = await pool.query<{
    usuario: string;
    id_painel_servidor: number | null;
    nome_painel: string | null;
    vencimento_real_painel: string | null;
  }>(
    `SELECT c.usuario, c.id_painel_servidor, ps.nome AS nome_painel, c.vencimento_real_painel::text
       FROM public.contas c
       LEFT JOIN public.painel_servidores ps ON ps.id = c.id_painel_servidor
      WHERE c.id_assinatura = $1::bigint AND c.removido_em IS NULL
      ORDER BY ps.nome, c.usuario`,
    [item.id_assinatura]
  );
  const atencao: string[] = [];
  const resultadosContas: ResultadoConta[] = [];
  if (contas.length === 0) atencao.push("sem conta vinculada no painel — confira à mão");

  for (const c of contas) {
    const painel = c.nome_painel ?? "sem painel";
    if (c.id_painel_servidor === null) {
      resultadosContas.push({ usuario: c.usuario, painel, situacao: "atencao", mensagem: "painel não integrado — renove à mão se precisar" });
      continue;
    }
    if (!c.vencimento_real_painel) {
      resultadosContas.push({ usuario: c.usuario, painel, situacao: "atencao", mensagem: "vencimento da conta desconhecido — confira no painel" });
      continue;
    }
    if (!contaPrecisaRenovarNoPainel(c, hoje)) {
      resultadosContas.push({ usuario: c.usuario, painel, situacao: "valida", mensagem: `válida até ${dataBR(c.vencimento_real_painel)}` });
      continue;
    }
    const rc = await renovarContaNoPainel(c.id_painel_servidor, c.usuario, { usuarioAuditoria: USUARIO_AUTOMATICO });
    resultadosContas.push(
      rc.ok
        ? { usuario: c.usuario, painel, situacao: "renovada", mensagem: rc.mensagem }
        : { usuario: c.usuario, painel, situacao: "erro", mensagem: rc.erro }
    );
  }
  for (const c of resultadosContas) {
    if (c.situacao === "erro" || c.situacao === "atencao") atencao.push(`conta ${c.usuario} (${c.painel}): ${c.mensagem}`);
  }

  // O caminho "pendente → ativo" do botão não devolve a assinatura; a data vem do banco
  const vencNovo =
    r.corpo.assinatura?.venc_contrato ??
    (await pool.query<{ v: string | null }>(
      `SELECT venc_contrato::text AS v FROM public.assinaturas WHERE id_assinatura = $1::bigint`,
      [item.id_assinatura]
    )).rows[0]?.v ?? null;
  return {
    rotulo: a.rotulo,
    acao: "renovado",
    motivo: null,
    vencContrato: vencNovo,
    whatsapp: r.corpo.whatsapp ?? null,
    contas: resultadosContas,
    atencao,
  };
}

/**
 * Pega os itens de Pix pago ainda não processados e decide cada um. Seguro chamar várias vezes e
 * em paralelo (webhook, tela do cliente e job): a trava no banco deixa cada item com um processo só.
 */
export async function processarPixPagos(): Promise<void> {
  const { rows: itens } = await pool.query<ItemPago>(
    `UPDATE public.pix_cobranca_itens i
        SET processando_desde = now()
       FROM public.pix_cobrancas c
      WHERE c.id = i.id_cobranca
        AND c.pago_em IS NOT NULL
        AND c.pago_em > now() - $1::interval
        AND i.processado_em IS NULL
        AND i.dispensado_em IS NULL
        AND (i.processando_desde IS NULL OR i.processando_desde < now() - $2::interval)
     RETURNING i.id_cobranca::text, i.id_assinatura::text, i.valor::text, i.meses,
               c.id_cliente::text, c.txid, c.valor::text AS valor_cobrado, c.valor_pago::text`,
    [`${JANELA_DIAS} days`, `${TRAVA_MINUTOS} minutes`]
  );
  if (itens.length === 0) return;

  const hoje = await hojeBrasilia();
  const porCobranca = new Map<string, { item: ItemPago; res: ResultadoItem }[]>();

  for (const item of itens) {
    let res: ResultadoItem;
    try {
      res = await processarItem(item, hoje);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[pix-renovacao] item ${item.id_cobranca}/${item.id_assinatura} falhou:`, msg);
      res = { rotulo: `#${item.id_assinatura}`, acao: "alertas", motivo: `Erro ao processar: ${msg}`.slice(0, 300) };
    }
    await pool.query(
      `UPDATE public.pix_cobranca_itens
          SET processado_em = now(), processando_desde = NULL, acao = $3, motivo = $4, resultado = $5
        WHERE id_cobranca = $1::bigint AND id_assinatura = $2::bigint`,
      [item.id_cobranca, item.id_assinatura, res.acao, res.motivo, JSON.stringify(res)]
    );
    console.log(`[pix-renovacao] ${item.txid} assinatura ${item.id_assinatura}: ${res.acao}${res.motivo ? ` (${res.motivo})` : ""}`);
    const lista = porCobranca.get(item.id_cobranca) ?? [];
    lista.push({ item, res });
    porCobranca.set(item.id_cobranca, lista);
  }

  for (const lista of porCobranca.values()) {
    await avisarJonas(lista).catch((err) =>
      console.error("[pix-renovacao] aviso no Telegram falhou:", err instanceof Error ? err.message : err)
    );
  }
}

function dataBR(d: string | null | undefined): string {
  return d ? d.split("T")[0].split("-").reverse().join("/") : "—";
}

function esc(s: string): string {
  return s.replace(/[<>&]/g, "");
}

/**
 * Um aviso por Pix: o que renovou sozinho e o que precisa dele. Com qualquer empecilho (sem conta,
 * conta com erro, item que não renovou) a 1ª linha já sai marcada com ⚠️.
 */
async function avisarJonas(lista: { item: ItemPago; res: ResultadoItem }[]): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID_JONAS;
  if (!botToken || !chatId) return;
  const { item } = lista[0];
  const { rows } = await pool.query<{ nome: string }>(
    `SELECT nome FROM public.clientes WHERE id_cliente = $1::bigint`,
    [item.id_cliente]
  );
  const texto = textoDoAviso(rows[0]?.nome ?? `#${item.id_cliente}`, item.valor_pago, lista.map((x) => x.res));
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: texto,
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: [[{ text: "Abrir alertas", url: `${URL_PAINEL}/alertas` }]] },
    }),
  });
  if (!res.ok) console.error(`[pix-renovacao] Telegram ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

/** Texto do aviso (separado do envio pra dar pra testar sem mandar mensagem). */
export function textoDoAviso(nome: string, valorPago: string | null, itens: ResultadoItem[]): string {
  const precisaAtencao = itens.some((res) => res.acao === "alertas" || (res.atencao?.length ?? 0) > 0);
  const linhas = [
    `${precisaAtencao ? "⚠️ " : ""}💸 Pix pelo link: <b>${esc(nome)}</b> — R$ ${Number(valorPago ?? 0).toFixed(2).replace(".", ",")}`,
  ];
  for (const res of itens) {
    if (res.acao === "renovado") {
      linhas.push(`✅ ${esc(res.rotulo)}: contrato renovado até ${dataBR(res.vencContrato)}`);
      for (const c of res.contas ?? []) {
        const icone = c.situacao === "renovada" ? "↳ ✅" : c.situacao === "valida" ? "↳" : "↳ ⚠️";
        linhas.push(`   ${icone} conta ${esc(c.usuario)} (${esc(c.painel)}): ${esc(c.mensagem)}`);
      }
      if ((res.contas?.length ?? 0) === 0) linhas.push("   ↳ ⚠️ sem conta vinculada no painel — confira à mão");
    } else {
      linhas.push(`⏳ ${esc(res.rotulo)}: NÃO renovado — ${esc(res.motivo ?? "")} (está em /alertas)`);
    }
  }
  return linhas.join("\n");
}
