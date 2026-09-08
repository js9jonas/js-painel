-- Migration 011: tabela de aprendizados do agente de atendimento do /chat
--
-- Mesmo padrão de lab.agente_dados_aprendizados (categoria, conteudo,
-- pergunta_origem, criado_em), com duas diferenças propositais:
--   - status (text) em vez de ativo (boolean) — já previa 3 estados desde
--     o planejamento original (ver docs/memoria/project_chat_ia_aprendizado_historico.md):
--     'ativo' (injetado no prompt), 'pendente_duvida' (aguardando revisão
--     do Jonas — reservado pra quando a Fase 3, painel de revisão, existir),
--     'descartado' (não usar, mas mantido pra auditoria em vez de apagar)
--   - origem_tipo: de onde veio o aprendizado — 'edicao' (diff entre
--     sugestao_ia e mensagem_final quando Jonas edita antes de enviar) ou
--     'contexto_painel' (contexto/instrução digitada no AgenteAtendimentoPanel)
CREATE SEQUENCE IF NOT EXISTS lab.chat_ia_aprendizados_id_seq;

CREATE TABLE IF NOT EXISTS lab.chat_ia_aprendizados (
  id              integer PRIMARY KEY DEFAULT nextval('lab.chat_ia_aprendizados_id_seq'),
  categoria       text NOT NULL,
  conteudo        text NOT NULL,
  pergunta_origem text,
  origem_tipo     text CHECK (origem_tipo IN ('edicao', 'contexto_painel')),
  status          text NOT NULL DEFAULT 'ativo'
                    CHECK (status IN ('ativo', 'pendente_duvida', 'descartado')),
  criado_em       timestamptz DEFAULT now()
);

ALTER SEQUENCE lab.chat_ia_aprendizados_id_seq OWNED BY lab.chat_ia_aprendizados.id;

CREATE INDEX IF NOT EXISTS ix_chat_ia_aprendizados_status
  ON lab.chat_ia_aprendizados (status) WHERE status = 'ativo';
