-- 29/09/2026: recálculo do resumo do /chat estourava o statement_timeout (15 s) na conversa
-- com ~7 mil mensagens; o webhook devolvia 500 e a Meta reenviava as mensagens horas depois.
-- Mesma lógica de scripts/2026-08-29-chat-conversas-resumo.sql, em consultas separadas com índice.
-- (rodar o CREATE INDEX CONCURRENTLY fora de transação)

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wamsg_telefone_recebida
  ON public.whatsapp_mensagens (telefone, recebida_em DESC);

CREATE OR REPLACE FUNCTION public.chat_resumo_recompute(p_telefone text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
-- Reescrita 29/09/2026: mesma lógica da versão de 29/08, mas em consultas separadas que usam
-- idx_wamsg_telefone_recebida. A versão anterior fazia join com contatos por OR (sem índice) e
-- subconsulta por linha no COUNT — em conversa com ~7 mil mensagens passava de 15 s
-- (statement_timeout do app), o webhook devolvia 500 e a Meta reenviava horas depois.
DECLARE
  v_ultima_em    timestamptz;
  v_ultima_msg   text;
  v_ultimo_tipo  text;
  v_nome_contato text;
  v_corte        timestamptz;
  v_nao_lidas    integer;
  v_id_cliente   bigint;
  v_nome_cliente text;
  v_foto_url     text;
BEGIN
  SELECT MAX(recebida_em), MAX(nome_contato)
    INTO v_ultima_em, v_nome_contato
  FROM public.whatsapp_mensagens WHERE telefone = p_telefone;

  IF NOT EXISTS (SELECT 1 FROM public.whatsapp_mensagens WHERE telefone = p_telefone) THEN
    DELETE FROM public.chat_conversas_resumo WHERE telefone = p_telefone;
    RETURN;
  END IF;

  SELECT conteudo, tipo INTO v_ultima_msg, v_ultimo_tipo
  FROM public.whatsapp_mensagens WHERE telefone = p_telefone
  ORDER BY recebida_em DESC LIMIT 1;

  v_corte := COALESCE(GREATEST(
    (SELECT MAX(recebida_em) FROM public.whatsapp_mensagens
      WHERE telefone = p_telefone AND origem != 'cliente'),
    (SELECT lido_em FROM public.whatsapp_leituras WHERE telefone = p_telefone)
  ), '1970-01-01');

  SELECT COUNT(*)::integer INTO v_nao_lidas
  FROM public.whatsapp_mensagens
  WHERE telefone = p_telefone AND origem = 'cliente' AND recebida_em > v_corte;

  SELECT MAX(ct.id_cliente), MAX(c.nome), MAX(ct.foto_url)
    INTO v_id_cliente, v_nome_cliente, v_foto_url
  FROM public.contatos ct
  LEFT JOIN public.clientes c ON c.id_cliente = ct.id_cliente
  WHERE ct.telefone IN (
    p_telefone,
    SUBSTRING(p_telefone, 3),
    SUBSTRING(p_telefone, 3, 2) || '9' || SUBSTRING(p_telefone, 5)
  );

  INSERT INTO public.chat_conversas_resumo AS r (
    telefone, nome_contato, id_cliente, nome_cliente, foto_url,
    ultima_mensagem_em, ultima_mensagem, ultimo_tipo, nao_lidas
  ) VALUES (
    p_telefone, v_nome_contato, v_id_cliente, v_nome_cliente, v_foto_url,
    v_ultima_em, v_ultima_msg, v_ultimo_tipo, v_nao_lidas
  )
  ON CONFLICT (telefone) DO UPDATE SET
    nome_contato       = EXCLUDED.nome_contato,
    id_cliente         = EXCLUDED.id_cliente,
    nome_cliente       = EXCLUDED.nome_cliente,
    foto_url           = EXCLUDED.foto_url,
    ultima_mensagem_em = EXCLUDED.ultima_mensagem_em,
    ultima_mensagem    = EXCLUDED.ultima_mensagem,
    ultimo_tipo        = EXCLUDED.ultimo_tipo,
    nao_lidas          = EXCLUDED.nao_lidas;
END;
$function$;
