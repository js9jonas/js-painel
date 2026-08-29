-- Tabela-resumo de conversas do chat: 1 linha por telefone, mantida incremental
-- via trigger em vez de recalculada do zero a cada leitura (era o gargalo que
-- travava o app inteiro sob polling concorrente — ver incidente 29/08/2026).

CREATE TABLE IF NOT EXISTS public.chat_conversas_resumo (
  telefone           text PRIMARY KEY,
  nome_contato       text,
  id_cliente         bigint,
  nome_cliente       text,
  foto_url           text,
  ultima_mensagem_em timestamptz NOT NULL,
  ultima_mensagem    text,
  ultimo_tipo        text,
  nao_lidas          integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_chat_resumo_ultima_mensagem
  ON public.chat_conversas_resumo (ultima_mensagem_em DESC);

-- Recalcula (upsert ou remove) a linha-resumo de UM telefone. Barata: tudo
-- filtrado por telefone, usa os índices já existentes em whatsapp_mensagens.
CREATE OR REPLACE FUNCTION public.chat_resumo_recompute(p_telefone text)
RETURNS void AS $$
DECLARE
  v_existe boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.whatsapp_mensagens WHERE telefone = p_telefone) INTO v_existe;

  IF NOT v_existe THEN
    DELETE FROM public.chat_conversas_resumo WHERE telefone = p_telefone;
    RETURN;
  END IF;

  INSERT INTO public.chat_conversas_resumo AS r (
    telefone, nome_contato, id_cliente, nome_cliente, foto_url,
    ultima_mensagem_em, ultima_mensagem, ultimo_tipo, nao_lidas
  )
  SELECT
    wm.telefone,
    MAX(wm.nome_contato),
    MAX(ct.id_cliente),
    MAX(c.nome),
    MAX(ct.foto_url),
    MAX(wm.recebida_em),
    (SELECT conteudo FROM public.whatsapp_mensagens WHERE telefone = wm.telefone ORDER BY recebida_em DESC LIMIT 1),
    (SELECT tipo FROM public.whatsapp_mensagens WHERE telefone = wm.telefone ORDER BY recebida_em DESC LIMIT 1),
    COUNT(*) FILTER (
      WHERE wm.origem = 'cliente'
        AND wm.recebida_em > COALESCE(
          GREATEST(
            (SELECT MAX(m2.recebida_em) FROM public.whatsapp_mensagens m2
             WHERE m2.telefone = wm.telefone AND m2.origem != 'cliente'),
            (SELECT lido_em FROM public.whatsapp_leituras WHERE telefone = wm.telefone)
          ),
          '1970-01-01'
        )
    )::integer
  FROM public.whatsapp_mensagens wm
  LEFT JOIN public.contatos ct ON (
    ct.telefone = wm.telefone
    OR ct.telefone = SUBSTRING(wm.telefone, 3)
    OR ct.telefone = SUBSTRING(wm.telefone, 3, 2) || '9' || SUBSTRING(wm.telefone, 5)
  )
  LEFT JOIN public.clientes c ON c.id_cliente = ct.id_cliente
  WHERE wm.telefone = p_telefone
  GROUP BY wm.telefone
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
$$ LANGUAGE plpgsql;

-- Trigger: toda escrita em whatsapp_mensagens mantém o resumo em dia.
-- Só dispara em UPDATE quando colunas relevantes ao resumo mudam (não em
-- todo status de entrega/leitura da Meta, que atualiza a linha com frequência).
CREATE OR REPLACE FUNCTION public.trg_chat_resumo_mensagens()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.chat_resumo_recompute(OLD.telefone);
  ELSE
    PERFORM public.chat_resumo_recompute(NEW.telefone);
    IF TG_OP = 'UPDATE' AND NEW.telefone IS DISTINCT FROM OLD.telefone THEN
      PERFORM public.chat_resumo_recompute(OLD.telefone);
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_whatsapp_mensagens_resumo ON public.whatsapp_mensagens;
CREATE TRIGGER trg_whatsapp_mensagens_resumo
AFTER INSERT OR DELETE OR UPDATE OF conteudo, tipo, origem, telefone, recebida_em
ON public.whatsapp_mensagens
FOR EACH ROW EXECUTE FUNCTION public.trg_chat_resumo_mensagens();

-- Trigger: marcar como lida também precisa recalcular nao_lidas.
CREATE OR REPLACE FUNCTION public.trg_chat_resumo_leituras()
RETURNS trigger AS $$
BEGIN
  PERFORM public.chat_resumo_recompute(NEW.telefone);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_whatsapp_leituras_resumo ON public.whatsapp_leituras;
CREATE TRIGGER trg_whatsapp_leituras_resumo
AFTER INSERT OR UPDATE ON public.whatsapp_leituras
FOR EACH ROW EXECUTE FUNCTION public.trg_chat_resumo_leituras();

-- Backfill: popula a tabela pra todos os telefones que já têm mensagem.
DO $$
DECLARE v_telefone text;
BEGIN
  FOR v_telefone IN SELECT DISTINCT telefone FROM public.whatsapp_mensagens LOOP
    PERFORM public.chat_resumo_recompute(v_telefone);
  END LOOP;
END $$;
