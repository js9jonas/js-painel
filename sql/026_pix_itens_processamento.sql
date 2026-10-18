-- Fase 2 do link de pagamento (18/10/2026): o que aconteceu com cada assinatura paga pelo Pix.
-- Assinatura atrasada, vencendo hoje ou pendente → renova sozinha (igual ao botão Renovar);
-- senão → fica em /alertas com o motivo. Ver src/lib/pix-renovacao.ts.
ALTER TABLE public.pix_cobranca_itens
  ADD COLUMN IF NOT EXISTS processando_desde timestamptz,  -- trava: um processo por vez (expira em 15 min)
  ADD COLUMN IF NOT EXISTS processado_em     timestamptz,
  ADD COLUMN IF NOT EXISTS acao              text CHECK (acao IN ('renovado', 'alertas')),
  ADD COLUMN IF NOT EXISTS motivo            text,         -- por que foi pra /alertas, ou erro
  ADD COLUMN IF NOT EXISTS resultado         jsonb;        -- novo vencimento e contas renovadas no painel

CREATE INDEX IF NOT EXISTS pix_cobranca_itens_a_processar_idx
  ON public.pix_cobranca_itens (id_cobranca) WHERE processado_em IS NULL AND dispensado_em IS NULL;
