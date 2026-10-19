// src/lib/pix-extrato.ts — Pix recebidos na chave (extrato do Inter, enviado pelo n8n) e a conclusão
// de quem pagou. Etapa 2 da renovação conclusiva (docs/memoria/project_renovacao_conclusiva_extrato.md):
// MODO SOMBRA — só marca "conclusivo"/"analisar" em pix_extrato; nada renova daqui.
//
// Prioridade (regra do Jonas, 18/10/2026): link Pix (webhook com txid) > extrato > comprovante do cliente.
// O Pix do link também aparece no extrato: aqui ele vira "link" e é ignorado.
// Datas: o Inter data os Pix da noite (depois das ~21h) com o dia seguinte — a análise usa `visto_em`
// (quando o n8n viu), nunca `data`, que só serve pra chave única.
import { pool } from "@/lib/db";

/** Espera antes de analisar: o webhook do link costuma chegar em segundos, mas a ordem não é garantida. */
const ESPERA_ANALISE_MIN = 3;
/** Cobrança do link ainda aberta com o mesmo valor: espera a conferência de 5 em 5 min confirmar. */
const ESPERA_COBRANCA_ABERTA_MIN = 30;
/** Pagamento do cliente registrado nesses dias antes do Pix → não conclui (pode ser o mesmo dinheiro). */
const DIAS_PAGAMENTO_RECENTE = 7;
const STATUS_PAGAVEIS = ["ativo", "pendente", "atrasado"];

export type PixDoExtrato = { dataEntrada: string; valor: number | string; titulo?: string; descricao: string };

// Mesma extração do nó "pegar ultima transação" do n8n: o nome é a sequência final de palavras.
// "PIX RECEBIDO - Cp :60701190-PAULO ROBERTO MACAGNAN" → "PAULO ROBERTO MACAGNAN"
export function nomeDaDescricao(descricao: string): string | null {
  const d = descricao.replace(/\s+/g, " ").trim();
  const m = d.match(/([A-Za-zÀ-ÖØ-öø-ÿ]+(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ]+)+)\s*$/);
  return m?.[1]?.trim().toUpperCase() || null;
}

// Nome comparável: maiúsculo, sem acento, espaços simples. A mesma regra em SQL fica em NORMALIZA_SQL.
export function normalizaNome(nome: string): string {
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}
const NORMALIZA_SQL = (col: string) =>
  `upper(regexp_replace(trim(translate(${col}, 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')), '\\s+', ' ', 'g'))`;

/**
 * Grava os Pix recebidos do dia (o n8n manda a lista inteira a cada Pix novo — reenviar é inofensivo).
 * Dois Pix iguais no mesmo dia (mesmo valor e descrição) viram linhas distintas pela ordem de ocorrência.
 */
export async function registrarPixExtrato(lista: PixDoExtrato[]): Promise<{ recebidos: number; novos: number }> {
  const ocorrencias = new Map<string, number>();
  let novos = 0;
  for (const t of lista) {
    const valor = Number(t.valor);
    const descricao = (t.descricao ?? "").replace(/\s+/g, " ").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.dataEntrada ?? "") || !(valor > 0) || !descricao) continue;
    const base = `${t.dataEntrada}|${valor.toFixed(2)}|${descricao}`;
    const n = (ocorrencias.get(base) ?? 0) + 1;
    ocorrencias.set(base, n);
    const r = await pool.query(
      `INSERT INTO public.pix_extrato (chave, data, valor, nome, descricao, titulo)
       VALUES ($1, $2::date, $3, $4, $5, $6) ON CONFLICT (chave) DO NOTHING`,
      [`${base}|${n}`, t.dataEntrada, valor.toFixed(2), nomeDaDescricao(descricao), descricao, t.titulo ?? null]
    );
    novos += r.rowCount ?? 0;
  }
  return { recebidos: lista.length, novos };
}

type Linha = { id: string; data: string; visto_em: string; valor: string; nome: string | null };
type Resultado =
  | { situacao: "link"; id_cobranca: string; id_cliente: string; motivo: string }
  | { situacao: "conclusivo"; id_cliente: string; id_assinatura: string; analise: Record<string, unknown> }
  | { situacao: "analisar"; motivo: string; id_cliente?: string; id_assinatura?: string; analise?: Record<string, unknown> }
  | { situacao: "pendente" };

async function analisar(p: Linha): Promise<Resultado> {
  // 1) Pix do link: cobrança paga no mesmo dia com o mesmo valor, ainda não ligada a outro Pix do extrato.
  const { rows: cobs } = await pool.query<{ id: string; id_cliente: string; status: string; pago_em: string | null }>(
    `SELECT c.id::text, c.id_cliente::text, c.status, c.pago_em::text
       FROM public.pix_cobrancas c
      WHERE COALESCE(c.valor_pago, c.valor) = $1::numeric
        AND NOT EXISTS (SELECT 1 FROM public.pix_extrato e WHERE e.id_cobranca = c.id)
        AND (c.pago_em BETWEEN $2::timestamptz - interval '24 hours' AND $2::timestamptz + interval '1 hour'
             OR (c.pago_em IS NULL AND c.status = 'ATIVA' AND c.criado_em > now() - interval '24 hours'))
      ORDER BY abs(extract(epoch FROM c.pago_em - $2::timestamptz)) NULLS LAST LIMIT 1`,
    [p.valor, p.visto_em]
  );
  const cob = cobs[0];
  if (cob?.pago_em) {
    return { situacao: "link", id_cobranca: cob.id, id_cliente: cob.id_cliente, motivo: "Pago pelo link (o webhook cuida)" };
  }
  if (cob && Date.now() - new Date(p.visto_em).getTime() < ESPERA_COBRANCA_ABERTA_MIN * 60_000) {
    return { situacao: "pendente" }; // pode ser o link com o webhook atrasado
  }

  // 2) Quem é o pagador: base de pagadores (pagamentos.pagador) + nome do próprio cliente.
  if (!p.nome) return { situacao: "analisar", motivo: "Nome do pagador não veio no extrato" };
  const nome = normalizaNome(p.nome);
  const { rows: cands } = await pool.query<{ id_cliente: string; nome: string; origem: string }>(
    `SELECT DISTINCT ON (x.id_cliente) x.id_cliente::text, cl.nome, x.origem
       FROM (SELECT id_cliente, 'pagador' AS origem FROM public.pagamentos
              WHERE pagador IS NOT NULL AND ${NORMALIZA_SQL("pagador")} = $1
             UNION ALL
             SELECT id_cliente, 'nome' FROM public.clientes WHERE ${NORMALIZA_SQL("nome")} = $1) x
       JOIN public.clientes cl ON cl.id_cliente = x.id_cliente
      ORDER BY x.id_cliente, x.origem DESC`,
    [nome]
  );
  if (cands.length === 0) return { situacao: "analisar", motivo: "Pagador desconhecido" };
  if (cands.length > 1) {
    return {
      situacao: "analisar",
      motivo: `Pagador ligado a ${cands.length} clientes: ${cands.map((c) => c.nome).join(", ")}`,
      analise: { clientes: cands },
    };
  }
  const cliente = cands[0];

  // 3) Uma única assinatura pagável.
  const { rows: assins } = await pool.query<{
    id_assinatura: string; status: string; id_plano: string; tipo: string; telas: number; meses: number;
    valor: string; venc_contrato: string | null; identificacao: string | null;
  }>(
    `SELECT a.id_assinatura::text, a.status, p.id_plano::text, p.tipo, p.telas, p.meses, p.valor::text,
            a.venc_contrato::text, a.identificacao
       FROM public.assinaturas a JOIN public.planos p ON p.id_plano = a.id_plano
      WHERE a.id_cliente = $1::bigint AND a.status = ANY($2::text[]) AND p.valor > 0`,
    [cliente.id_cliente, STATUS_PAGAVEIS]
  );
  const base = { cliente: cliente.nome, pelo: cliente.origem };
  if (assins.length !== 1) {
    return {
      situacao: "analisar", id_cliente: cliente.id_cliente,
      motivo: assins.length === 0 ? `${cliente.nome}: nenhuma assinatura a pagar` : `${cliente.nome}: ${assins.length} assinaturas`,
      analise: base,
    };
  }
  const a = assins[0];

  // 4) Valor exato de um plano do pacote dele (mesmo tipo e telas; o período vem do plano que bateu).
  const { rows: planos } = await pool.query<{ id_plano: string; meses: number }>(
    `SELECT id_plano::text, meses FROM public.planos
      WHERE tipo = $1 AND telas = $2 AND valor = $3::numeric ORDER BY (id_plano = $4::bigint) DESC, meses`,
    [a.tipo, a.telas, p.valor, a.id_plano]
  );
  const plano = planos.find((x) => x.id_plano === a.id_plano) ?? (planos.length === 1 ? planos[0] : null);
  if (!plano) {
    return {
      situacao: "analisar", id_cliente: cliente.id_cliente, id_assinatura: a.id_assinatura,
      motivo: planos.length === 0
        ? `${cliente.nome}: R$ ${p.valor} não é valor de plano ${a.tipo} ${a.telas} tela(s) (atual R$ ${a.valor})`
        : `${cliente.nome}: R$ ${p.valor} bate com mais de um plano`,
      analise: base,
    };
  }

  // 5) Sem pagamento recente registrado ANTES do Pix (o que vier depois é o próprio Pix sendo renovado à mão).
  const { rows: recentes } = await pool.query<{ id: number; data_pgto: string }>(
    `SELECT id, data_pgto::text FROM public.pagamentos
      WHERE id_cliente = $1::bigint
        AND data_pgto >= ($2::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date - $3::int
        AND (atualizado_em IS NULL OR atualizado_em < $4::timestamptz AT TIME ZONE 'America/Sao_Paulo')
      ORDER BY data_pgto DESC LIMIT 1`,
    [cliente.id_cliente, p.visto_em, DIAS_PAGAMENTO_RECENTE, p.visto_em]
  );
  if (recentes[0]) {
    return {
      situacao: "analisar", id_cliente: cliente.id_cliente, id_assinatura: a.id_assinatura,
      motivo: `${cliente.nome}: já tem pagamento em ${recentes[0].data_pgto.split("-").reverse().join("/")} (#${recentes[0].id})`,
      analise: base,
    };
  }

  // 6) Outro Pix do extrato já concluído pra mesma assinatura nesses dias.
  const { rows: outro } = await pool.query<{ id: string }>(
    `SELECT id::text FROM public.pix_extrato
      WHERE id_assinatura = $1::bigint AND situacao = 'conclusivo' AND id <> $2::bigint
        AND visto_em >= $3::timestamptz - make_interval(days => $4::int) LIMIT 1`,
    [a.id_assinatura, p.id, p.visto_em, DIAS_PAGAMENTO_RECENTE]
  );
  if (outro[0]) {
    return {
      situacao: "analisar", id_cliente: cliente.id_cliente, id_assinatura: a.id_assinatura,
      motivo: `${cliente.nome}: segundo Pix pra mesma assinatura em ${DIAS_PAGAMENTO_RECENTE} dias`,
      analise: base,
    };
  }

  return {
    situacao: "conclusivo", id_cliente: cliente.id_cliente, id_assinatura: a.id_assinatura,
    analise: {
      ...base, identificacao: a.identificacao, status: a.status, venc_contrato: a.venc_contrato,
      id_plano: plano.id_plano, meses: plano.meses, plano_atual: plano.id_plano === a.id_plano,
    },
  };
}

/** Analisa os Pix pendentes com mais de alguns minutos (chamado pelo POST do n8n e de 5 em 5 min). */
export async function analisarPixPendentes(): Promise<number> {
  const { rows } = await pool.query<Linha>(
    `SELECT id::text, data::text, visto_em::text, valor::text, nome FROM public.pix_extrato
      WHERE situacao = 'pendente' AND visto_em < now() - $1::interval
      ORDER BY visto_em LIMIT 50`,
    [`${ESPERA_ANALISE_MIN} minutes`]
  );
  let feitos = 0;
  for (const p of rows) {
    try {
      const r = await analisar(p);
      if (r.situacao === "pendente") continue;
      await pool.query(
        `UPDATE public.pix_extrato
            SET situacao = $2, motivo = $3, analise = $4, analisado_em = now(),
                id_cliente = $5::bigint, id_assinatura = $6::bigint, id_cobranca = $7::bigint
          WHERE id = $1::bigint AND situacao = 'pendente'`,
        [
          p.id, r.situacao,
          "motivo" in r ? r.motivo : null,
          "analise" in r && r.analise ? JSON.stringify(r.analise) : null,
          "id_cliente" in r ? r.id_cliente ?? null : null,
          "id_assinatura" in r ? r.id_assinatura ?? null : null,
          r.situacao === "link" ? r.id_cobranca : null,
        ]
      );
      feitos++;
    } catch (err) {
      console.error(`[pix-extrato] análise do Pix ${p.id} falhou:`, err instanceof Error ? err.message : err);
    }
  }
  return feitos;
}

// ── Modo sombra no /chat (etapa 3): botão ao lado do balão "RESUMO GERADO POR IA" ──────────────────────

export type ConclusaoComprovante = {
  resumo: { pagador: string | null; valor: string | null };
  pix: {
    id: string; visto_em: string; valor: string; nome: string | null; situacao: string; motivo: string | null;
    cliente: string | null; id_cliente: string | null; id_assinatura: string | null;
    identificacao: string | null; meses: number | null;
  } | null;
  /** Outros Pix do extrato com o mesmo valor perto da hora do comprovante (quando o nome não decidiu). */
  outros: number;
  /** O que foi registrado de fato depois do Pix — pra medir se a conclusão acertou. */
  registrado: { id: number; cliente: string | null; id_cliente: string; id_assinatura: string | null; data_pgto: string } | null;
  confere: boolean | null;
};

/** Acha o Pix do extrato que corresponde a um resumo de comprovante e devolve a conclusão do modo sombra. */
export async function conclusaoDoComprovante(idMsg: number): Promise<ConclusaoComprovante | null> {
  const { rows: ms } = await pool.query<{ telefone: string; criado_em: string; pagador: string | null; valor: string | null }>(
    `SELECT telefone, criado_em::text,
            upper(trim(substring(conteudo from 'Nome do Pagador:\\s*([^\\n]+)'))) AS pagador,
            replace(replace(substring(conteudo from 'Valor pago:\\s*R\\$\\s*([0-9.,]+)'), '.', ''), ',', '.') AS valor
       FROM public.whatsapp_mensagens WHERE id = $1 AND conteudo LIKE 'RESUMO GERADO POR IA%'`,
    [idMsg]
  );
  const m = ms[0];
  if (!m) return null;
  const resumo = { pagador: m.pagador, valor: m.valor };
  const vazio = { resumo, pix: null, outros: 0, registrado: null, confere: null };
  if (!m.valor || !(Number(m.valor) > 0)) return vazio;

  const { rows: clientesDoChat } = await pool.query<{ id_cliente: string }>(
    `SELECT DISTINCT id_cliente::text FROM public.contatos WHERE telefone = $1 AND id_cliente IS NOT NULL`,
    [m.telefone]
  );
  const idsChat = clientesDoChat.map((c) => c.id_cliente);

  // Comprovante costuma vir logo depois do Pix; aceita de 12 h antes a 2 h depois. Preferência: nome igual
  // ao do comprovante, depois cliente desta conversa, depois o mais perto no tempo.
  const { rows: pixs } = await pool.query<NonNullable<ConclusaoComprovante["pix"]> & { ordem: number }>(
    `SELECT e.id::text, e.visto_em::text, e.valor::text, e.nome, e.situacao, e.motivo,
            COALESCE(cl.nome, e.analise->>'cliente') AS cliente, e.id_cliente::text, e.id_assinatura::text,
            e.analise->>'identificacao' AS identificacao, (e.analise->>'meses')::int AS meses,
            (CASE WHEN ${NORMALIZA_SQL("e.nome")} = ${NORMALIZA_SQL("$3")} THEN 0 ELSE 2 END
             + CASE WHEN e.id_cliente::text = ANY($4::text[]) THEN 0 ELSE 1 END) AS ordem
       FROM public.pix_extrato e LEFT JOIN public.clientes cl ON cl.id_cliente = e.id_cliente
      WHERE e.valor = $1::numeric
        AND e.visto_em BETWEEN $2::timestamptz - interval '12 hours' AND $2::timestamptz + interval '2 hours'
      ORDER BY ordem, abs(extract(epoch FROM e.visto_em - $2::timestamptz))`,
    [m.valor, m.criado_em, m.pagador ?? "", idsChat]
  );
  const pix = pixs[0] ?? null;
  if (!pix) return vazio;

  // Pagamento registrado depois do Pix (renovação pelo comprovante, pelo botão ou pelo link).
  const ids = [...new Set([...idsChat, ...(pix.id_cliente ? [pix.id_cliente] : [])])];
  const { rows: pgs } = await pool.query<NonNullable<ConclusaoComprovante["registrado"]>>(
    `SELECT p.id, cl.nome AS cliente, p.id_cliente::text, p.id_assinatura::text, p.data_pgto::text
       FROM public.pagamentos p LEFT JOIN public.clientes cl ON cl.id_cliente = p.id_cliente
      WHERE p.id_cliente = ANY($1::bigint[]) AND p.valor = $2::numeric
        AND p.atualizado_em >= ($3::timestamptz - interval '5 minutes') AT TIME ZONE 'America/Sao_Paulo'
      ORDER BY p.atualizado_em LIMIT 1`,
    [ids, pix.valor, pix.visto_em]
  );
  const registrado = pgs[0] ?? null;
  const confere =
    pix.situacao !== "conclusivo" || !registrado
      ? null
      : registrado.id_cliente === pix.id_cliente &&
        (registrado.id_assinatura === null || registrado.id_assinatura === pix.id_assinatura);

  const { ordem: _o, ...pixSemOrdem } = pix;
  void _o;
  return { resumo, pix: pixSemOrdem, outros: pixs.length - 1, registrado, confere };
}

/**
 * Mantém a base de pagadores em dia (mesma regra da carga inicial de 18/10/2026): resumo de comprovante dos
 * últimos dias → pagamento do cliente daquele telefone, mesmo valor, de 1 dia antes a 3 dias depois, só
 * quando a ligação é 1↔1. Grava `pagamentos.pagador` onde ainda está vazio. Roda no job de 5 em 5 min.
 */
export async function aprenderPagadores(): Promise<number> {
  const r = await pool.query(`
    WITH r AS (
      SELECT m.id AS id_msg, m.telefone, (m.criado_em AT TIME ZONE 'America/Sao_Paulo')::date AS d,
             upper(regexp_replace(trim(substring(m.conteudo from 'Nome do Pagador:\\s*([^\\n]+)')), '\\s+', ' ', 'g')) AS pag,
             nullif(replace(replace(substring(m.conteudo from 'Valor pago:\\s*R\\$\\s*([0-9.,]+)'), '.', ''), ',', '.'), '')::numeric AS valor
        FROM public.whatsapp_mensagens m
       WHERE m.origem = 'jonas' AND m.tipo = 'text' AND m.conteudo LIKE 'RESUMO GERADO POR IA%'
         AND m.criado_em > now() - interval '3 days'
    ), limpos AS (
      -- Lixo da leitura da IA: destinatário lido como pagador, placeholders, nome de conta.
      SELECT * FROM r
       WHERE pag IS NOT NULL AND valor IS NOT NULL AND length(pag) >= 5
         AND pag !~ '^[\\[(]' AND pag !~ '^(N/?A|-)$' AND pag !~ '^(NÃO |NAO |DESCONHECIDO|POUPANÇA|CONTA )'
         AND pag !~ '^JS SISTEMAS' AND pag !~ 'JONAS.*SCHEIBE' AND pag !~ '[0-9*]'
    ), cand AS (
      SELECT l.id_msg, l.pag, p.id AS id_pgto, p.pagador
        FROM limpos l
        JOIN (SELECT DISTINCT telefone, id_cliente FROM public.contatos WHERE id_cliente IS NOT NULL) ct ON ct.telefone = l.telefone
        JOIN public.pagamentos p ON p.id_cliente = ct.id_cliente AND p.valor = l.valor
                                AND p.data_pgto BETWEEN l.d - 1 AND l.d + 3
    ), um_a_um AS (
      SELECT c.* FROM cand c
       WHERE (SELECT count(*) FROM cand x WHERE x.id_msg = c.id_msg) = 1
         AND (SELECT count(*) FROM cand x WHERE x.id_pgto = c.id_pgto) = 1
    )
    UPDATE public.pagamentos p SET pagador = u.pag
      FROM um_a_um u WHERE p.id = u.id_pgto AND p.pagador IS NULL`);
  return r.rowCount ?? 0;
}
