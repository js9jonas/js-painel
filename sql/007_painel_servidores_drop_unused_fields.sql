-- Migration 007: remove colunas sem uso ativo em painel_servidores
-- url_api: nunca lido por nenhum adapter (endpoints ficam hardcoded em src/lib/painel-adapters/*)
-- padrao_usuario / padrao_senha: só texto informativo exibido no card, nunca usado na geração de conta/teste
ALTER TABLE public.painel_servidores DROP COLUMN IF EXISTS url_api;
ALTER TABLE public.painel_servidores DROP COLUMN IF EXISTS padrao_usuario;
ALTER TABLE public.painel_servidores DROP COLUMN IF EXISTS padrao_senha;
