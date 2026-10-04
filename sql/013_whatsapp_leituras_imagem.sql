-- Migration 013: leitura de MAC/chave de imagem do /chat passa a ser permanente
--
-- Até aqui o resultado da leitura (ícone na imagem do /chat ou reação 🔄 pelo celular) só existia
-- na memória da página e sumia ao trocar de conversa — reabrir exigia nova chamada à IA.
-- Guarda só o que a IA extraiu da imagem (app, MAC, chave, validade, outros, observação); o
-- cruzamento com public.aplicativos ("já cadastrado"/"pode cadastrar") é recalculado a cada
-- exibição, senão ficaria desatualizado depois de cadastrar o app.
-- Tabela separada de whatsapp_mensagens de propósito: UPDATE lá dispara o gatilho do resumo das
-- conversas (incidente de lentidão de 29/09/2026).
CREATE TABLE IF NOT EXISTS public.whatsapp_leituras_imagem (
  id_mensagem bigint PRIMARY KEY REFERENCES public.whatsapp_mensagens(id) ON DELETE CASCADE,
  dados       jsonb NOT NULL,
  modelo      text,
  lido_em     timestamptz NOT NULL DEFAULT now()
);
