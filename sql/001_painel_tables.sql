-- =============================================================================
-- 001_painel_tables.sql
-- Criação das tabelas painel_servidores e painel_apps,
-- evolução da tabela contas e migração dos dados de servidores.
--
-- EXECUTAR NESSA ORDEM. Pode ser revertido com 001_painel_tables_rollback.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. CRIAR painel_servidores
--    Painéis de gerenciamento de contas (CLUB, CENTRAL, UNIPLAY, NOW, UNITV...)
-- ---------------------------------------------------------------------------
CREATE TABLE public.painel_servidores (
  id               BIGINT PRIMARY KEY,
  nome             TEXT        NOT NULL,
  tipo             TEXT        NOT NULL,   -- 'club','central','uniplay','now','unitv','liebe','fast','natv',...
  url_painel       TEXT,                   -- endereço da página de acesso (humano)
  url_api          TEXT,                   -- endpoint base da API
  usuario          TEXT,
  senha            TEXT,
  session_cookie   TEXT,
  session_expiry   TIMESTAMPTZ,
  api_token        TEXT,
  api_secret       TEXT,
  master           TEXT,                   -- nome do contato/revendedor master
  contato_master   TEXT,                   -- telefone do master
  padrao_usuario   TEXT,                   -- critério de criação de usuário (NULL = automático)
  padrao_senha     TEXT,                   -- critério de criação de senha (NULL = automático)
  ativo            BOOLEAN     NOT NULL DEFAULT true,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sequência começa em 100 para evitar colisão com os IDs migrados (1–12)
CREATE SEQUENCE public.painel_servidores_id_seq START 100;
ALTER TABLE public.painel_servidores
  ALTER COLUMN id SET DEFAULT nextval('public.painel_servidores_id_seq');

-- ---------------------------------------------------------------------------
-- 2. CRIAR painel_apps
--    Painéis de aplicativo com acesso por MAC (FunPlays, LazerPlay, SmartOne...)
-- ---------------------------------------------------------------------------
CREATE TABLE public.painel_apps (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome             TEXT        NOT NULL,
  tipo             TEXT        NOT NULL,   -- 'funplays','lazerplay','smartone',...
  url_painel       TEXT,                   -- endereço da página de gerenciamento
  url_api          TEXT,                   -- endpoint base da API
  api_token        TEXT,
  api_secret       TEXT,
  master           TEXT,
  contato_master   TEXT,
  modo_acesso      TEXT        NOT NULL    -- 'coletivo' = todos os MACs numa página
    CHECK (modo_acesso IN ('coletivo','individual')),  -- 'individual' = cada MAC/senha separado
  ativo            BOOLEAN     NOT NULL DEFAULT true,
  criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- 3. MIGRAR dados de servidores → painel_servidores
--    Apenas linhas com painel_tipo definido e que não sejam descontinuadas
-- ---------------------------------------------------------------------------
INSERT INTO public.painel_servidores
  (id, nome, tipo, url_painel, url_api, usuario, senha,
   session_cookie, session_expiry, api_token, api_secret, ativo)
SELECT
  id_servidor,
  codigo_publico,
  painel_tipo,
  painel_url,
  NULL,          -- url_api: preencher manualmente depois (ver comentários abaixo)
  painel_usuario,
  painel_senha,
  session_cookie,
  session_expiry,
  api_token,
  api_secret,
  ativo
FROM public.servidores
WHERE painel_tipo IS NOT NULL
  AND painel_tipo <> 'tvexpress';  -- TV Express descontinuado

-- url_api por tipo (preencher após migração):
-- club:    url_api = 'https://pdcapi.io'
-- central: url_api = 'https://api.controle.fit/api'
-- uniplay: url_api = 'https://gesapioffice.com/api'
-- now:     url_api = 'https://pnw7.cc'
-- unitv:   url_api = 'https://panel-web.starhome.vip/api'
-- liebe:   url_api = 'https://liebeapp.sigma.vin/api'
-- fast:    url_api = 'https://api.painelcliente.com'

UPDATE public.painel_servidores SET url_api = 'https://pdcapi.io'             WHERE tipo = 'club';
UPDATE public.painel_servidores SET url_api = 'https://api.controle.fit/api'  WHERE tipo = 'central';
UPDATE public.painel_servidores SET url_api = 'https://gesapioffice.com/api'  WHERE tipo = 'uniplay';
UPDATE public.painel_servidores SET url_api = 'https://pnw7.cc'               WHERE tipo = 'now';
UPDATE public.painel_servidores SET url_api = 'https://panel-web.starhome.vip/api' WHERE tipo = 'unitv';
UPDATE public.painel_servidores SET url_api = 'https://liebeapp.sigma.vin/api' WHERE tipo = 'liebe';
UPDATE public.painel_servidores SET url_api = 'https://api.painelcliente.com'  WHERE tipo = 'fast';

-- ---------------------------------------------------------------------------
-- 4. EVOLUIR tabela contas
--    Adicionar FK para painel_servidores, vínculo com assinaturas e campos novos
-- ---------------------------------------------------------------------------
ALTER TABLE public.contas
  ADD COLUMN id_painel_servidor BIGINT REFERENCES public.painel_servidores(id),
  ADD COLUMN id_assinatura      BIGINT REFERENCES public.assinaturas(id_assinatura),
  ADD COLUMN mac                TEXT,
  ADD COLUMN status_sinc        TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status_sinc IN ('pendente','confirmado'));

-- Preencher id_painel_servidor a partir do id_servidor já existente
-- (os IDs são os mesmos pois foram inseridos com os IDs originais)
UPDATE public.contas c
SET id_painel_servidor = c.id_servidor
WHERE EXISTS (
  SELECT 1 FROM public.painel_servidores ps WHERE ps.id = c.id_servidor
);

-- Criar índices para as consultas mais comuns
CREATE INDEX idx_contas_painel_servidor ON public.contas(id_painel_servidor);
CREATE INDEX idx_contas_assinatura      ON public.contas(id_assinatura);
CREATE INDEX idx_contas_status_sinc     ON public.contas(status_sinc);

-- ---------------------------------------------------------------------------
-- 5. HABILITAR extensão pg_trgm para cruzamento por similaridade de nome
--    (usada na vinculação automática contas → assinaturas)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- VERIFICAÇÃO FINAL
-- ---------------------------------------------------------------------------
SELECT 'painel_servidores' AS tabela, COUNT(*) FROM public.painel_servidores
UNION ALL
SELECT 'painel_apps',                  COUNT(*) FROM public.painel_apps
UNION ALL
SELECT 'contas (com painel_srv)',       COUNT(*) FROM public.contas WHERE id_painel_servidor IS NOT NULL
UNION ALL
SELECT 'contas (sem painel_srv)',       COUNT(*) FROM public.contas WHERE id_painel_servidor IS NULL;
