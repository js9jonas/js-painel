-- Robô de navegador (19/10/2026): desde quando o robô está na tela de login/bloqueio de um site (o robô avisa com
-- sem_tarefa no /api/interno/robo/proxima). Preso ali há mais de 45 s, a tela recusa o pedido na hora com o motivo,
-- em vez de enfileirar e expirar em 2 min (caso de 19/10: PC ligou sem rede, Central e FAST paradas ~10 min).
-- Coluna nula: pode aplicar antes do deploy.
ALTER TABLE public.robo_status ADD COLUMN IF NOT EXISTS sem_sessao_desde timestamptz;
