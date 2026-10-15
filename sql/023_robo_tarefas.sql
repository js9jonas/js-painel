-- Robô de navegador (15/10/2026). Sites com managed challenge do Cloudflare (POP Player, Duplecast) só
-- abrem em navegador real: um Chrome comum, sem automação, roda numa tela virtual no PC do Jonas com a
-- extensão robo-navegador/extensao. Ela busca tarefas aqui (via /api/interno/robo/*) e devolve o resultado.
-- O servidor nunca fala com o PC: é o PC que pergunta, então não precisa abrir porta no roteador.
CREATE TABLE IF NOT EXISTS public.robo_tarefas (
  id            bigserial PRIMARY KEY,
  alvo          text NOT NULL,                      -- site: 'popplayer'
  acao          text NOT NULL,                      -- 'listas_do_mac' | 'criar' | 'editar' | 'apagar' | 'listar_todos'
  params        jsonb NOT NULL DEFAULT '{}'::jsonb,
  status        text NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente', 'executando', 'ok', 'erro', 'expirada')),
  resultado     jsonb,
  erro          text,
  usuario       text,                               -- quem pediu na tela
  criado_em     timestamptz NOT NULL DEFAULT now(),
  iniciado_em   timestamptz,
  concluido_em  timestamptz
);
CREATE INDEX IF NOT EXISTS robo_tarefas_fila_idx ON public.robo_tarefas (alvo, status, id);

-- Último contato do robô por site: a tela recusa na hora quando o PC está desligado, em vez de deixar
-- a tarefa esperando (ação velha executada horas depois duplicaria lista se a pessoa tentou de novo).
CREATE TABLE IF NOT EXISTS public.robo_status (
  alvo      text PRIMARY KEY,
  visto_em  timestamptz NOT NULL,
  versao    text
);
