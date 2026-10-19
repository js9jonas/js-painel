-- Aceitação do link de pagamento (19/10/2026): o que a página do cliente não deixava registrado — quem abriu
-- o link e desistiu antes de gerar o Pix, e quem abriu os "Planos estendidos". Gerar/pagar já fica em
-- pix_cobrancas. Lido pelo funil de /alertas (src/lib/pix-funil.ts).
CREATE TABLE IF NOT EXISTS public.pix_link_eventos (
  id          bigserial PRIMARY KEY,
  id_cliente  bigint NOT NULL REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
  evento      text NOT NULL CHECK (evento IN ('abriu', 'estendidos')),
  celular     boolean,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pix_link_eventos_criado_idx ON public.pix_link_eventos (criado_em DESC);

-- A página pública só grava (não lê) — sql/025
GRANT INSERT (id_cliente, evento, celular) ON public.pix_link_eventos TO app_portal_cliente;
GRANT USAGE ON SEQUENCE public.pix_link_eventos_id_seq TO app_portal_cliente;
