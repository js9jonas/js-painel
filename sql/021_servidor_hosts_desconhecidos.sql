-- 021 — card "Desconhecidos" na aba Hosts de /conexoes (13/10/2026)
--
-- Endereço de lista que NÃO é de nenhum servidor do Jonas (lista que o cliente trouxe de fora): fica em
-- servidor_hosts sem servidor (id_painel_servidor NULL), só para sair de "ainda não identificados".
-- Nunca é principal. Idempotente.

ALTER TABLE public.servidor_hosts ALTER COLUMN id_painel_servidor DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.servidor_hosts ADD CONSTRAINT ck_servidor_hosts_desconhecido_nao_principal
    CHECK (id_painel_servidor IS NOT NULL OR papel <> 'principal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
