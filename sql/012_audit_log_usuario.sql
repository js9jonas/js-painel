-- Migration 012: quem fez cada alteração registrada no audit_log
--
-- Até aqui o audit_log não guardava o usuário, e renovações/exclusões de
-- pagamento nem entravam nele. Incidente de 30/09/2026 (cliente 2888): uma
-- renovação acidental só pôde ser reconstruída pelo log de acesso do Traefik,
-- que é rotativo e não identifica o usuário logado (só o IP).
-- Nulo = registro anterior a esta migration ou gravado fora de uma sessão
-- (ex.: rota chamada por n8n/cron).
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS usuario text;
