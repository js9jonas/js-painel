-- Migration 010: tri-state de aproveitamento da sugestão de IA no /chat
--
-- Antes: foi_aceita (boolean) só era gravado quando a sugestão era usada sem
-- nenhuma edição — toda vez que a sugestão era editada ou descartada, o sinal
-- se perdia (sugestao_ia chegava NULL no INSERT). foi_aceita continua existindo
-- e com o mesmo significado (usado pelo badge "✦ IA" em chat/page.tsx), só
-- deixa de ser a única fonte de sinal.
--
-- status_sugestao é o novo tri-state, gravado sempre que uma sugestão foi
-- gerada pra aquela resposta (independente de ter sido usada ou não):
--   'aceita_sem_edicao' — enviado exatamente como a IA sugeriu
--   'editada'            — Jonas alterou o texto antes de enviar
--   'descartada'          — Jonas ignorou a sugestão (✕) e escreveu outra coisa
ALTER TABLE public.whatsapp_mensagens
  ADD COLUMN IF NOT EXISTS status_sugestao text
    CHECK (status_sugestao IN ('aceita_sem_edicao', 'editada', 'descartada'));
