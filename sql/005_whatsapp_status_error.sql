-- Migration 005: guarda o motivo de falha reportado pela Meta em status updates do WhatsApp
ALTER TABLE public.whatsapp_mensagens
  ADD COLUMN IF NOT EXISTS status_error jsonb;
