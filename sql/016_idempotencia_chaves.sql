-- 016 — chaves de idempotência (12/10/2026)
--
-- Toda requisição que altera dados vinda do navegador (fetch POST/PUT/PATCH/DELETE e server actions)
-- leva um cabeçalho Idempotency-Key com um UUID novo por chamada (src/components/IdempotenciaFetch.tsx).
-- O proxy (src/proxy.ts) grava a chave aqui antes de deixar a requisição passar; se a mesma chave chega
-- de novo, é o navegador reenviando a mesma requisição (ex.: ao retomar a aba) e ela é recusada com 409.
-- Caso real: docs/memoria/incident_template_duplicado_post_reenviado_12out2026.md.
--
-- `repeticoes` conta quantas vezes a chave foi barrada — serve pra medir o quanto isso acontece.
-- Limpeza automática em src/lib/idempotencia.ts (7 dias; as repetidas ficam 90 dias).
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.idempotencia_chaves (
  chave             text        PRIMARY KEY,
  usuario           text,
  metodo            text        NOT NULL,
  rota              text        NOT NULL,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  repeticoes        integer     NOT NULL DEFAULT 0,
  ultima_repeticao  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_idempotencia_chaves_criado_em ON public.idempotencia_chaves (criado_em);
