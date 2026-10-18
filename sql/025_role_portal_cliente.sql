-- Usuário de banco das páginas públicas do cliente (cliente.jssistemas.online), 18/10/2026.
-- O resto do app ainda conecta como o superusuário postgres (troca planejada em
-- project_infra_least_privilege_db). Aqui a parte que recebe dados de qualquer pessoa na internet
-- só enxerga o mínimo: um defeito numa rota pública não lê nem altera o resto do banco.
--
-- A SENHA NÃO FICA AQUI (repo público): depois de rodar este arquivo,
--   ALTER ROLE app_portal_cliente PASSWORD '<senha>';
-- e a URL vai pra DATABASE_URL_PORTAL no Easypanel (src/lib/db-portal.ts).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_portal_cliente') THEN
    CREATE ROLE app_portal_cliente LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT CONNECTION LIMIT 5;
  END IF;
END $$;

ALTER ROLE app_portal_cliente SET statement_timeout = '5s';
ALTER ROLE app_portal_cliente SET timezone = 'America/Sao_Paulo';

REVOKE ALL ON SCHEMA public FROM app_portal_cliente;
GRANT USAGE ON SCHEMA public TO app_portal_cliente;

-- Leitura só das colunas que a página usa (nada de telefone, observação, contas, apps, pagamentos)
GRANT SELECT (token, id_cliente) ON public.pix_links TO app_portal_cliente;
GRANT SELECT (id_cliente, nome) ON public.clientes TO app_portal_cliente;
GRANT SELECT (id_assinatura, id_cliente, id_plano, identificacao, status, venc_contrato) ON public.assinaturas TO app_portal_cliente;
GRANT SELECT (id_plano, tipo, telas, meses, valor) ON public.planos TO app_portal_cliente;

-- Cobranças: cria e lê; não altera nem apaga (a confirmação do Pix roda no lado do painel)
GRANT SELECT, INSERT ON public.pix_cobrancas TO app_portal_cliente;
GRANT SELECT, INSERT ON public.pix_cobranca_itens TO app_portal_cliente;
GRANT USAGE ON SEQUENCE public.pix_cobrancas_id_seq TO app_portal_cliente;
