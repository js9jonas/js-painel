-- Migration 008: URL de acesso web do painel (ex: FAST usa vover.me)
-- Usado para a opção "Enviar acesso web" nos balões de conta
ALTER TABLE public.painel_servidores ADD COLUMN IF NOT EXISTS url_acesso_web TEXT;
