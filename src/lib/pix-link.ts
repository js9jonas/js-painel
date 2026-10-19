// src/lib/pix-link.ts — link de pagamento por Pix com txid (fase 1, 18/10/2026).
// Cada cliente tem um link fixo /pagar/<token>. A página lista as assinaturas, o cliente escolhe e
// a cobrança imediata (cob) é criada no Inter nessa hora. O Pix pago é confirmado pelo txid
// (webhook do Inter, consulta da própria página ou o job de conferência) e cai em /alertas.
// Fase 2 (18/10/2026): depois de confirmado, src/lib/pix-renovacao.ts renova sozinho o que estiver
// atrasado/vencendo hoje e manda o resto pra /alertas — ver docs/memoria/project_link_pagamento_pix.md.
// Bancos: o que a página pública faz com dado do visitante (token, assinaturas escolhidas, txid)
// usa dbPortal() — usuário app_portal_cliente, só lê as colunas da página e cria cobranças.
// O resto (link, confirmação do Pix com audit_log, /alertas, job) roda no pool do painel.
import { randomBytes } from "crypto";
import QRCode from "qrcode";
import { pool } from "@/lib/db";
import { analisarPixPendentes, aprenderPagadores } from "@/lib/pix-extrato";
import { dbPortal } from "@/lib/db-portal";
import { registrarAudit } from "@/lib/audit";
import { criarCob, consultarCob, novoTxid, type CobInter } from "@/lib/inter";
import { URL_CLIENTE } from "@/lib/enderecos";
import { processarPixPagos } from "@/lib/pix-renovacao";


/** Validade da cobrança no Inter. Link aberto de novo dentro disso reaproveita o mesmo QR. */
const EXPIRACAO_SEGUNDOS = 24 * 60 * 60;
/** Cobrança com menos que isso de validade não é reaproveitada (o cliente pode demorar pra pagar). */
const SOBRA_MINIMA_MS = 30 * 60 * 1000;
/** Teto de cobranças novas por cliente em 24 h — cada troca de seleção gera uma; acima disso recusa. */
export const MAX_COBRANCAS_DIA = 20;
/** A tela do cliente consulta o Inter no máximo uma vez nesse intervalo por cobrança. */
const INTERVALO_CONSULTA_MS = 4_000;

const STATUS_PAGAVEIS = ["ativo", "pendente", "atrasado"];
const FORMATO_TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

export type AssinaturaLink = {
  id_assinatura: string;
  identificacao: string | null;
  plano: string;
  meses: number;
  valor: string;
  venc_contrato: string | null;
  status: string;
};

export type CobrancaLink = {
  txid: string;
  valor: string;
  status: string;
  pix_copia_cola: string;
  /** Já formatado pra exibir: "19/10/2026 às 14:05" (horário de Brasília). */
  expira_em: string;
  pago_em: string | null;
  consultado_em: string | null;
  assinaturas: string[];
};

export type DadosLink = {
  primeiroNome: string;
  assinaturas: AssinaturaLink[];
  cobrancaAberta: CobrancaLink | null;
};

/** Link do cliente, criando o token na primeira vez. */
export async function obterLinkCliente(idCliente: string): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  const { rows } = await pool.query<{ token: string }>(
    `WITH novo AS (
       INSERT INTO public.pix_links (id_cliente, token) VALUES ($1::bigint, $2)
       ON CONFLICT (id_cliente) DO NOTHING
       RETURNING token
     )
     SELECT token FROM novo
     UNION ALL
     SELECT token FROM public.pix_links WHERE id_cliente = $1::bigint
     LIMIT 1`,
    [idCliente, token]
  );
  return `${URL_CLIENTE}/pagar/${rows[0].token}`;
}

async function clientePorToken(token: string): Promise<{ id_cliente: string; nome: string } | null> {
  if (!FORMATO_TOKEN.test(token)) return null;
  const { rows } = await dbPortal().query<{ id_cliente: string; nome: string }>(
    `SELECT c.id_cliente::text, c.nome
     FROM public.pix_links l JOIN public.clientes c ON c.id_cliente = l.id_cliente
     WHERE l.token = $1`,
    [token]
  );
  return rows[0] ?? null;
}

async function assinaturasPagaveis(idCliente: string): Promise<AssinaturaLink[]> {
  const { rows } = await dbPortal().query<AssinaturaLink>(
    `SELECT a.id_assinatura::text, a.identificacao, a.status,
            CONCAT(p.tipo, ' ', p.telas, CASE WHEN p.telas = 1 THEN ' tela' ELSE ' telas' END) AS plano,
            p.meses, p.valor::text AS valor, a.venc_contrato::text AS venc_contrato
     FROM public.assinaturas a JOIN public.planos p ON p.id_plano = a.id_plano
     WHERE a.id_cliente = $1::bigint AND a.status = ANY($2::text[]) AND p.valor > 0
     ORDER BY a.venc_contrato NULLS LAST, a.id_assinatura`,
    [idCliente, STATUS_PAGAVEIS]
  );
  return rows;
}

const SELECT_COBRANCA = `
  SELECT c.txid, c.valor::text, c.status, c.pix_copia_cola,
         to_char(c.expira_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI') AS expira_em,
         c.pago_em::text,
         c.consultado_em::text,
         ARRAY(SELECT i.id_assinatura::text FROM public.pix_cobranca_itens i
               WHERE i.id_cobranca = c.id ORDER BY i.id_assinatura) AS assinaturas
  FROM public.pix_cobrancas c`;

export async function dadosDoLink(token: string): Promise<DadosLink | null> {
  const cliente = await clientePorToken(token);
  if (!cliente) return null;
  const [assinaturas, abertas] = await Promise.all([
    assinaturasPagaveis(cliente.id_cliente),
    dbPortal().query<CobrancaLink>(
      `${SELECT_COBRANCA}
       WHERE c.id_cliente = $1::bigint AND c.status = 'ATIVA' AND c.expira_em > now() + $2::interval
       ORDER BY c.criado_em DESC LIMIT 1`,
      [cliente.id_cliente, `${SOBRA_MINIMA_MS / 1000} seconds`]
    ),
  ]);
  return {
    primeiroNome: primeiroNome(cliente.nome),
    assinaturas,
    cobrancaAberta: abertas.rows[0] ?? null,
  };
}

function primeiroNome(nome: string): string {
  const p = (nome ?? "").trim().split(/\s+/)[0] ?? "";
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : "";
}

export function qrSvg(texto: string): Promise<string> {
  return QRCode.toString(texto, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}

export class ErroLink extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Cria (ou reaproveita) a cobrança das assinaturas escolhidas pelo cliente. */
export async function gerarCobranca(token: string, idsEscolhidos: string[]): Promise<CobrancaLink> {
  const cliente = await clientePorToken(token);
  if (!cliente) throw new ErroLink("Link de pagamento não encontrado.", 404);

  const disponiveis = await assinaturasPagaveis(cliente.id_cliente);
  const escolhidas = disponiveis.filter((a) => idsEscolhidos.includes(a.id_assinatura));
  if (escolhidas.length === 0 || escolhidas.length !== new Set(idsEscolhidos).size) {
    throw new ErroLink("Escolha pelo menos uma assinatura.", 400);
  }
  const ids = escolhidas.map((a) => a.id_assinatura).sort();
  const valor = escolhidas.reduce((s, a) => s + Number(a.valor), 0);

  // Mesma seleção com cobrança ainda válida: devolve o mesmo QR (cliente recarregou a página).
  const { rows: existente } = await dbPortal().query<CobrancaLink>(
    `${SELECT_COBRANCA}
     WHERE c.id_cliente = $1::bigint AND c.status = 'ATIVA' AND c.expira_em > now() + $2::interval
     ORDER BY c.criado_em DESC`,
    [cliente.id_cliente, `${SOBRA_MINIMA_MS / 1000} seconds`]
  );
  const igual = existente.find(
    (c) => c.assinaturas.join(",") === ids.join(",") && Number(c.valor) === Number(valor.toFixed(2))
  );
  if (igual) return igual;

  const { rows: cont } = await dbPortal().query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM public.pix_cobrancas
     WHERE id_cliente = $1::bigint AND criado_em > now() - interval '24 hours'`,
    [cliente.id_cliente]
  );
  if (cont[0].n >= MAX_COBRANCAS_DIA) {
    throw new ErroLink("Muitas tentativas hoje. Fale com a gente pelo WhatsApp que ajudamos você.", 429);
  }

  // Inter primeiro, banco depois: se a gravação falhar, a cobrança fica sem dono no banco mas
  // ninguém tem o QR dela; o contrário deixaria uma cobrança no banco que não existe no Inter.
  const txid = novoTxid();
  const cob = await criarCob(txid, valor, EXPIRACAO_SEGUNDOS, "Assinatura JS Sistemas");
  if (!cob.pixCopiaECola) throw new ErroLink("O banco não devolveu o código Pix. Tente de novo.", 500);

  const client = await dbPortal().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO public.pix_cobrancas (txid, id_cliente, valor, status, pix_copia_cola, expira_em)
       VALUES ($1, $2::bigint, $3::numeric, $4, $5, now() + $6::interval)
       RETURNING id::text`,
      [txid, cliente.id_cliente, valor.toFixed(2), cob.status, cob.pixCopiaECola, `${EXPIRACAO_SEGUNDOS} seconds`]
    );
    for (const a of escolhidas) {
      await client.query(
        `INSERT INTO public.pix_cobranca_itens (id_cobranca, id_assinatura, valor, meses)
         VALUES ($1::bigint, $2::bigint, $3::numeric, $4)`,
        [rows[0].id, a.id_assinatura, a.valor, a.meses]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const { rows: criada } = await dbPortal().query<CobrancaLink>(`${SELECT_COBRANCA} WHERE c.txid = $1`, [txid]);
  return criada[0];
}

/** Situação da cobrança pra tela do cliente; consulta o Inter se ainda não foi paga. */
export async function situacaoCobranca(token: string, txid: string): Promise<CobrancaLink | null> {
  const cliente = await clientePorToken(token);
  if (!cliente) return null;
  const { rows } = await dbPortal().query<CobrancaLink>(
    `${SELECT_COBRANCA}
     WHERE c.txid = $1 AND c.id_cliente = $2::bigint`,
    [txid, cliente.id_cliente]
  );
  const cob = rows[0];
  if (!cob) return null;
  const recente = cob.consultado_em && Date.now() - new Date(cob.consultado_em).getTime() < INTERVALO_CONSULTA_MS;
  if (cob.status === "ATIVA" && !recente) {
    // Gravação da confirmação fica no lado do painel: o usuário do portal não altera cobrança
    await confirmarCobranca(txid).catch((err) =>
      console.error(`[pix-link] consulta ${txid} falhou:`, err instanceof Error ? err.message : err)
    );
    const { rows: depois } = await dbPortal().query<CobrancaLink>(`${SELECT_COBRANCA} WHERE c.txid = $1`, [txid]);
    return depois[0];
  }
  return cob;
}

/**
 * Consulta a cobrança no Inter e grava o resultado. Chamado pelo webhook, pela tela do cliente e
 * pelo job de conferência — nunca confia no conteúdo do aviso, só no que o Inter responde aqui.
 * Idempotente: o Pix só é registrado uma vez (pago_em IS NULL na gravação).
 */
export async function confirmarCobranca(txid: string): Promise<"paga" | "ja_paga" | "aberta" | "desconhecida"> {
  const { rows: existe } = await pool.query<{ id: string }>(
    `SELECT id::text FROM public.pix_cobrancas WHERE txid = $1`,
    [txid]
  );
  if (existe.length === 0) return "desconhecida";

  const cob: CobInter = await consultarCob(txid);
  const pix = cob.pix?.[0];

  if (cob.status !== "CONCLUIDA" || !pix) {
    await pool.query(
      `UPDATE public.pix_cobrancas SET status = $2, consultado_em = now() WHERE txid = $1 AND pago_em IS NULL`,
      [txid, cob.status]
    );
    return "aberta";
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string; id_cliente: string; valor: string }>(
      `UPDATE public.pix_cobrancas
       SET status = 'CONCLUIDA', consultado_em = now(), pago_em = $2::timestamptz,
           valor_pago = $3::numeric, end_to_end_id = $4, pagador_nome = $5
       WHERE txid = $1 AND pago_em IS NULL
       RETURNING id::text, id_cliente::text, valor::text`,
      [txid, pix.horario, pix.valor, pix.endToEndId, pix.pagador?.nome ?? pix.nomePagador ?? null]
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return "ja_paga";
    }
    const c = rows[0];
    const { rows: itens } = await client.query<{ id_assinatura: string }>(
      `SELECT id_assinatura::text FROM public.pix_cobranca_itens WHERE id_cobranca = $1::bigint`,
      [c.id]
    );
    await registrarAudit(client, {
      tipo: "pix_link",
      id_cliente: c.id_cliente,
      id_assinatura: itens.length === 1 ? itens[0].id_assinatura : null,
      descricao: `Pix pelo link recebido: R$ ${Number(pix.valor).toFixed(2).replace(".", ",")}`,
      dados_depois: {
        txid,
        end_to_end_id: pix.endToEndId,
        valor_cobrado: c.valor,
        valor_pago: pix.valor,
        assinaturas: itens.map((i) => i.id_assinatura),
      },
    });
    await client.query("COMMIT");
    // Fase 2: renova sozinho o que estiver atrasado/vencendo hoje, avisa o Jonas no Telegram.
    // Sem await: o aviso do Inter e a tela do cliente não esperam a renovação no painel.
    processarPixPagos().catch((err) =>
      console.error("[pix-link] processamento do Pix falhou:", err instanceof Error ? err.message : err)
    );
    return "paga";
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export type PixAlertaRow = {
  id_cobranca: string;
  id_assinatura: string;
  id_cliente: string;
  nome: string;
  identificacao: string | null;
  plano: string;
  status: string | null;
  venc_contrato: string | null;
  valor_item: string;
  valor_cobrado: string;
  valor_pago: string;
  pago_em: string;
  ultimo_pagamento: string | null;
  /** null = ainda sendo processado (renovação automática em andamento ou na fila). */
  processado_em: string | null;
  motivo: string | null;
};

/**
 * Assinaturas pagas pelo link que ainda não foram renovadas. Some sozinha quando aparece um
 * pagamento da assinatura registrado depois do Pix (renovação automática ou pelo botão), ou ao dispensar.
 */
export async function getPixParaRenovar(): Promise<PixAlertaRow[]> {
  const { rows } = await pool.query<PixAlertaRow>(
    `SELECT c.id::text AS id_cobranca, i.id_assinatura::text, cl.id_cliente::text, cl.nome,
            a.identificacao, a.status, a.venc_contrato::text,
            CONCAT(p.tipo, ' ', p.telas, CASE WHEN p.telas = 1 THEN ' tela' ELSE ' telas' END) AS plano,
            i.valor::text AS valor_item, c.valor::text AS valor_cobrado, c.valor_pago::text,
            c.pago_em::text, i.processado_em::text, i.motivo,
            (SELECT MAX(pg.data_pgto)::text FROM public.pagamentos pg WHERE pg.id_assinatura = i.id_assinatura) AS ultimo_pagamento
     FROM public.pix_cobrancas c
     JOIN public.pix_cobranca_itens i ON i.id_cobranca = c.id
     JOIN public.assinaturas a ON a.id_assinatura = i.id_assinatura
     JOIN public.planos p ON p.id_plano = a.id_plano
     JOIN public.clientes cl ON cl.id_cliente = c.id_cliente
     WHERE c.pago_em IS NOT NULL
       AND c.pago_em > now() - interval '60 days'
       AND i.dispensado_em IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.pagamentos pg
         WHERE pg.id_assinatura = i.id_assinatura AND pg.atualizado_em >= c.pago_em
       )
     ORDER BY c.pago_em`
  );
  return rows;
}

/**
 * Cobranças abertas: rede de segurança se o aviso do Inter não chegar. Cobrança vencida continua
 * ATIVA no Inter (só não aceita mais pagamento), por isso o corte em 1 h depois da validade.
 * Teto de MAX_CONFERENCIAS_POR_VEZ consultas por rodada — o limite de chamadas do Inter pra API
 * Pix não está documentado (o extrato aceita só 10/min); o que sobrar fica pra próxima rodada.
 */
export const MAX_CONFERENCIAS_POR_VEZ = 10;
export async function conferirCobrancasAbertas(): Promise<void> {
  const { rows } = await pool.query<{ txid: string }>(
    `SELECT txid FROM public.pix_cobrancas
     WHERE status = 'ATIVA' AND expira_em > now() - interval '1 hour'
       AND (consultado_em IS NULL OR consultado_em < now() - interval '5 minutes')
     ORDER BY consultado_em NULLS FIRST LIMIT $1`,
    [MAX_CONFERENCIAS_POR_VEZ]
  );
  for (const r of rows) {
    try {
      await confirmarCobranca(r.txid);
    } catch (err) {
      console.error(`[pix-link] conferência ${r.txid} falhou:`, err instanceof Error ? err.message : err);
    }
  }
}

/** Job de conferência (instrumentation.ts): a cada 5 min, além do aviso do Inter e da tela do cliente. */
const INTERVALO_CONFERENCIA_MS = 5 * 60 * 1000;
export function iniciarConferenciaPix() {
  setInterval(async () => {
    await conferirCobrancasAbertas().catch((err) =>
      console.error("[pix-link] conferência falhou:", err instanceof Error ? err.message : err)
    );
    // Retenta o que ficou pra trás (processo reiniciado no meio, item travado há mais de 15 min)
    await processarPixPagos().catch((err) =>
      console.error("[pix-link] processamento do Pix falhou:", err instanceof Error ? err.message : err)
    );
    // Pix do extrato (n8n) que chegaram e ainda esperavam o webhook do link — src/lib/pix-extrato.ts
    await analisarPixPendentes().catch((err) =>
      console.error("[pix-extrato] análise falhou:", err instanceof Error ? err.message : err)
    );
    await aprenderPagadores().catch((err) =>
      console.error("[pix-extrato] base de pagadores falhou:", err instanceof Error ? err.message : err)
    );
  }, INTERVALO_CONFERENCIA_MS);
}
