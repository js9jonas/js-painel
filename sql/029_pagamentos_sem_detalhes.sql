-- Exclui pagamentos.detalhes (19/10/2026). A coluna servia de marca de conferência ('OK') e, desde
-- 18/10, ficou sem função: a conferência está em `conferencia` e quem pagou em `pagador` (sql/027).
-- Antes de excluir, todas as linhas tinham só 'OK' ou vazio; nenhum workflow do n8n lê a coluna.
-- ⚠️ Aplicar só DEPOIS do deploy do código que parou de usar `detalhes` (senão o painel em produção quebra).
-- A view v_assinatura_atual_from_pagamentos (sem uso no código) repassava a coluna: é recriada sem ela.
BEGIN;

DROP VIEW public.v_assinatura_atual_from_pagamentos;

CREATE VIEW public.v_assinatura_atual_from_pagamentos AS
 WITH base AS (
         SELECT p.id,
            p.id_cliente,
            p.cliente,
            p.compra,
            p.data_pgto,
            p.valor,
            p.forma,
            p.tipo,
            p.atualizado_em
           FROM pagamentos p
          WHERE p.data_pgto IS NOT NULL
        ), ultimo AS (
         SELECT DISTINCT ON (base.id_cliente) base.id,
            base.id_cliente,
            base.cliente,
            base.compra,
            base.data_pgto,
            base.valor,
            base.forma,
            base.tipo,
            base.atualizado_em
           FROM base
          WHERE base.id_cliente IS NOT NULL
          ORDER BY base.id_cliente, base.data_pgto DESC, base.id DESC
        ), parse AS (
         SELECT u.id,
            u.id_cliente,
            u.cliente,
            u.compra,
            u.data_pgto,
            u.valor,
            u.forma,
            u.tipo,
            u.atualizado_em,
            COALESCE(NULLIF((regexp_match(lower(u.compra), 'x\s*([0-9]+)'::text))[1], ''::text)::integer, NULLIF((regexp_match(lower(u.compra), '([0-9]+)\s*telas'::text))[1], ''::text)::integer, 1) AS qtd_telas_parse,
                CASE
                    WHEN lower(u.compra) ~ '\bclub\b'::text THEN 'Club'::text
                    WHEN lower(u.compra) ~ '\bcentral\b'::text THEN 'Central'::text
                    WHEN lower(u.compra) ~ '\bnow\b'::text THEN 'NOW'::text
                    WHEN lower(u.compra) ~ '\buniplay\b'::text THEN 'Uniplay'::text
                    WHEN lower(u.compra) ~ '\bunity\b'::text THEN 'Unity'::text
                    ELSE NULL::text
                END AS servidor_parse
           FROM ultimo u
        )
 SELECT id,
    id_cliente,
    cliente,
    compra,
    data_pgto,
    valor,
    forma,
    tipo,
    atualizado_em,
    qtd_telas_parse,
    servidor_parse
   FROM parse;

GRANT ALL ON public.v_assinatura_atual_from_pagamentos TO app_painel;

ALTER TABLE public.pagamentos DROP COLUMN detalhes;

COMMIT;
