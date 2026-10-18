-- Link de pagamento por Pix com txid (18/10/2026). Cada cliente tem um link fixo /pagar/<token>;
-- ao abrir, a página gera uma cobrança imediata (cob) no Inter e o Pix pago chega pelo webhook com o
-- txid — conciliação exata, sem depender do nome de quem pagou (ver docs/memoria/project_link_pagamento_pix.md).
-- Fase 1: cobrança paga só aparece em /alertas; nada renova sozinho.

-- Token do link de cada cliente (criado na 1ª vez que o link é pedido). Trocar o token invalida o link antigo.
CREATE TABLE IF NOT EXISTS public.pix_links (
  id_cliente  bigint PRIMARY KEY REFERENCES public.clientes(id_cliente) ON DELETE CASCADE,
  token       text NOT NULL UNIQUE,
  criado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pix_cobrancas (
  id              bigserial PRIMARY KEY,
  txid            text NOT NULL UNIQUE,
  -- Sem CASCADE (igual a pagamentos): registro de dinheiro recebido não some junto com o cliente.
  id_cliente      bigint NOT NULL REFERENCES public.clientes(id_cliente),
  valor           numeric(10,2) NOT NULL,
  -- Espelho do status do Inter: ATIVA | CONCLUIDA | REMOVIDA_PELO_USUARIO_RECEBEDOR | REMOVIDA_PELO_PSP
  status          text NOT NULL DEFAULT 'ATIVA',
  pix_copia_cola  text NOT NULL,
  expira_em       timestamptz NOT NULL,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  consultado_em   timestamptz,                       -- última consulta ao Inter (limita a frequência)
  pago_em         timestamptz,
  valor_pago      numeric(10,2),
  end_to_end_id   text UNIQUE,
  pagador_nome    text
);
CREATE INDEX IF NOT EXISTS pix_cobrancas_cliente_idx ON public.pix_cobrancas (id_cliente, criado_em DESC);
CREATE INDEX IF NOT EXISTS pix_cobrancas_ativas_idx ON public.pix_cobrancas (expira_em) WHERE status = 'ATIVA';

-- Assinaturas pagas por cada cobrança (um Pix pode pagar a do cliente e a de um familiar).
-- dispensado_em: Jonas tirou o item de /alertas sem renovar (ex.: devolveu o Pix).
CREATE TABLE IF NOT EXISTS public.pix_cobranca_itens (
  id_cobranca    bigint NOT NULL REFERENCES public.pix_cobrancas(id) ON DELETE CASCADE,
  id_assinatura  bigint NOT NULL REFERENCES public.assinaturas(id_assinatura),
  valor          numeric(10,2) NOT NULL,
  meses          integer NOT NULL,
  dispensado_em  timestamptz,
  dispensado_por text,
  PRIMARY KEY (id_cobranca, id_assinatura)
);
CREATE INDEX IF NOT EXISTS pix_cobranca_itens_assinatura_idx ON public.pix_cobranca_itens (id_assinatura);
