-- Conferência e pagador nos pagamentos (18/10/2026) — etapa 1 da renovação conclusiva pelo extrato.
-- Antes a conferência era o texto 'OK' em `detalhes` (45.606 linhas); agora tem coluna própria:
--   conferido  — Jonas conferiu (botão OK) — inclui todas as conferências antigas
--   analisar   — ainda não conferido (Pix não identificado no extrato, outras contas…)
--   conclusivo — renovado pelo cruzamento extrato × base de pagadores (etapas seguintes)
--   automatico — renovado pelo link de pagamento Pix (webhook do Inter)
-- `pagador`: nome de quem pagou (resumo do comprovante / extrato) — base pra reconhecer o cliente
-- quando o nome do pagador não é o do cliente (~26% dos comprovantes).
-- `detalhes` fica como está: o 'OK' antigo não é apagado (o botão OK continua gravando, por compatibilidade).
ALTER TABLE public.pagamentos
  ADD COLUMN IF NOT EXISTS conferencia text NOT NULL DEFAULT 'analisar'
    CHECK (conferencia IN ('conferido', 'analisar', 'conclusivo', 'automatico')),
  ADD COLUMN IF NOT EXISTS pagador text;

UPDATE public.pagamentos SET conferencia = 'conferido'
 WHERE upper(trim(detalhes)) = 'OK' AND conferencia = 'analisar';

-- Cortesia não tem dinheiro a conferir.
UPDATE public.pagamentos SET conferencia = 'conferido'
 WHERE forma = 'Cortesia' AND conferencia = 'analisar';

CREATE INDEX IF NOT EXISTS pagamentos_analisar_idx
  ON public.pagamentos (data_pgto DESC) WHERE conferencia = 'analisar';
