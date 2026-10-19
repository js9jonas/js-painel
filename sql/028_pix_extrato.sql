-- Pix recebidos na chave, lidos do extrato do Inter pelo n8n (18/10/2026) — etapa 2 da renovação conclusiva.
-- O n8n (workflow "Automações JS", mesmo ponto do aviso da Alexa) manda a lista de Pix do dia para
-- POST /api/interno/pix/extrato; cada Pix vira uma linha só (chave única) — é a trava contra renovar duas
-- vezes o mesmo Pix, independente do "vistos" do Redis do n8n. Ver src/lib/pix-extrato.ts e
-- docs/memoria/project_renovacao_conclusiva_extrato.md.
--   pendente   — ainda não analisado (espera alguns minutos pro webhook do link chegar antes)
--   link       — é o Pix de uma cobrança do link de pagamento (o webhook manda; extrato ignora)
--   conclusivo — pagador conhecido de 1 cliente com 1 assinatura e valor de plano (modo sombra: só marca)
--   analisar   — não deu pra concluir (motivo em `motivo`)
CREATE TABLE IF NOT EXISTS public.pix_extrato (
  id             bigserial PRIMARY KEY,
  chave          text NOT NULL UNIQUE,          -- data|valor|descrição|ocorrência no dia
  data           date NOT NULL,                 -- dataEntrada do extrato (o extrato não traz hora)
  visto_em       timestamptz NOT NULL DEFAULT now(),  -- quando o n8n viu (precisão de ~1 min)
  valor          numeric(10,2) NOT NULL,
  nome           text,                          -- pagador, tirado da descrição
  descricao      text NOT NULL,
  titulo         text,
  situacao       text NOT NULL DEFAULT 'pendente'
                 CHECK (situacao IN ('pendente', 'link', 'conclusivo', 'analisar')),
  motivo         text,
  analise        jsonb,                         -- cliente, assinatura, plano e período concluídos
  analisado_em   timestamptz,
  id_cliente     bigint REFERENCES public.clientes(id_cliente),
  id_assinatura  bigint REFERENCES public.assinaturas(id_assinatura),
  id_cobranca    bigint UNIQUE REFERENCES public.pix_cobrancas(id),
  id_pagamento   integer UNIQUE REFERENCES public.pagamentos(id)   -- pagamento que esse Pix gerou/confirmou
);
CREATE INDEX IF NOT EXISTS pix_extrato_data_idx ON public.pix_extrato (data DESC);
CREATE INDEX IF NOT EXISTS pix_extrato_pendente_idx ON public.pix_extrato (visto_em) WHERE situacao = 'pendente';
CREATE INDEX IF NOT EXISTS pix_extrato_cliente_idx ON public.pix_extrato (id_cliente, data DESC);
