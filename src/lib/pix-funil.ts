// Funil do link de pagamento em /alertas (19/10/2026): quanto os clientes estão aceitando o "⚡ Ative na hora".
// Botões tocados → link enviado → página aberta → Pix gerado → pago → renovado sozinho, e quem gerou e não pagou.
// Aberturas da página vêm de pix_link_eventos (sql/031); o resto já estava gravado.
import { pool } from "@/lib/db";

export const DIAS_FUNIL = 7;

// Cliente de teste do Jonas ("JS Contas"): fica fora dos números
const CLIENTE_TESTE = "2573";

export type FunilLink = {
  tocouAtiveNaHora: number;
  tocouChavePix: number;
  linkEnviado: number;
  abriuPagina: number;
  abriuEstendidos: number;
  gerouPix: number;
  pagou: number;
  pagouEstendido: number;
  renovadoSozinho: number;
  foiParaAlertas: number;
  naoPagos: { id_cliente: string; nome: string; valor: string; criado_em: string; expirou: boolean }[];
};

// /alertas recarrega a cada 5 s; o funil não precisa de tanto
const CACHE_MS = 60_000;
let cache: { em: number; dados: FunilLink } | null = null;

export async function getFunilLink(): Promise<FunilLink> {
  if (cache && Date.now() - cache.em < CACHE_MS) return cache.dados;
  const dados = await consultarFunil();
  cache = { em: Date.now(), dados };
  return dados;
}

async function consultarFunil(): Promise<FunilLink> {
  const p = [DIAS_FUNIL, CLIENTE_TESTE];
  const [totais, naoPagos] = await Promise.all([
    pool.query(
      `WITH teste AS (SELECT telefone FROM public.contatos WHERE id_cliente = $2::bigint),
            msg AS (
              SELECT telefone, conteudo, tipo, source FROM public.whatsapp_mensagens
               WHERE recebida_em >= now() - make_interval(days => $1::int)
                 AND telefone NOT IN (SELECT telefone FROM teste)
            ),
            cob AS (
              SELECT * FROM public.pix_cobrancas
               WHERE criado_em >= now() - make_interval(days => $1::int) AND id_cliente <> $2::bigint
            ),
            ev AS (
              SELECT * FROM public.pix_link_eventos
               WHERE criado_em >= now() - make_interval(days => $1::int) AND id_cliente <> $2::bigint
            )
       SELECT
         (SELECT count(DISTINCT telefone) FROM msg WHERE tipo = 'interactive_reply' AND conteudo ILIKE '%Ative na hora%')::int AS "tocouAtiveNaHora",
         (SELECT count(DISTINCT telefone) FROM msg WHERE tipo = 'interactive_reply' AND conteudo ILIKE '%Chave PIX%')::int AS "tocouChavePix",
         (SELECT count(DISTINCT telefone) FROM msg WHERE source = 'auto-resposta-link')::int AS "linkEnviado",
         (SELECT count(DISTINCT id_cliente) FROM ev WHERE evento = 'abriu')::int AS "abriuPagina",
         (SELECT count(DISTINCT id_cliente) FROM ev WHERE evento = 'estendidos')::int AS "abriuEstendidos",
         (SELECT count(DISTINCT id_cliente) FROM cob)::int AS "gerouPix",
         (SELECT count(DISTINCT id_cliente) FROM cob WHERE pago_em IS NOT NULL)::int AS "pagou",
         (SELECT count(DISTINCT c.id_cliente) FROM cob c JOIN public.pix_cobranca_itens i ON i.id_cobranca = c.id
           WHERE c.pago_em IS NOT NULL AND i.meses > 1)::int AS "pagouEstendido",
         (SELECT count(*) FROM cob c JOIN public.pix_cobranca_itens i ON i.id_cobranca = c.id WHERE i.acao = 'renovado')::int AS "renovadoSozinho",
         (SELECT count(*) FROM cob c JOIN public.pix_cobranca_itens i ON i.id_cobranca = c.id WHERE i.acao = 'alertas')::int AS "foiParaAlertas"`,
      p
    ),
    // Gerou o Pix e não pagou nenhum depois (a última cobrança de cada cliente)
    pool.query(
      `SELECT DISTINCT ON (c.id_cliente) c.id_cliente::text, cl.nome, c.valor::text, c.criado_em::text,
              (c.expira_em < now()) AS expirou
         FROM public.pix_cobrancas c
         JOIN public.clientes cl ON cl.id_cliente = c.id_cliente
        WHERE c.criado_em >= now() - make_interval(days => $1::int) AND c.id_cliente <> $2::bigint
          AND c.pago_em IS NULL
          AND NOT EXISTS (SELECT 1 FROM public.pix_cobrancas d
                           WHERE d.id_cliente = c.id_cliente AND d.pago_em IS NOT NULL AND d.criado_em >= c.criado_em)
        ORDER BY c.id_cliente, c.criado_em DESC`,
      p
    ),
  ]);
  return { ...totais.rows[0], naoPagos: naoPagos.rows };
}
