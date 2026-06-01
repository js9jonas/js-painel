-- Rollback de 001_painel_tables.sql
-- ATENÇÃO: desfaz a migração. Dados inseridos em painel_servidores/apps serão perdidos.

ALTER TABLE public.contas
  DROP COLUMN IF EXISTS id_painel_servidor,
  DROP COLUMN IF EXISTS id_assinatura,
  DROP COLUMN IF EXISTS mac,
  DROP COLUMN IF EXISTS status_sinc;

DROP TABLE IF EXISTS public.painel_apps;
DROP TABLE IF EXISTS public.painel_servidores;
DROP SEQUENCE IF EXISTS public.painel_servidores_id_seq;
