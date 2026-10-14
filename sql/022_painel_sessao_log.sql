-- Registro de todos os tokens de painel (14/10/2026). Motivo: a IBOSOL não informa a validade do
-- token (guardamos login + 12 h, palpite) e derrubou token antes disso. Uma linha por token.
-- Login e troca vêm do gatilho em painel_servidores e servidores (pega toda rota que grava sessão);
-- ultimo_ok_em/recusado_em vêm do código (hoje só a revenda IBOSOL): a queda foi entre os dois.
-- Só o md5 do token fica gravado, nunca o token.
CREATE TABLE IF NOT EXISTS public.painel_sessao_log (
  id                bigserial PRIMARY KEY,
  token_hash        text NOT NULL UNIQUE,   -- md5(session_cookie)
  tabela            text,                   -- painel_servidores | servidores
  id_painel         bigint,                 -- id / id_servidor
  tipo              text,                   -- tipo / painel_tipo
  login_em          timestamptz,            -- token gravado no banco
  expira_previsto   timestamptz,            -- session_expiry que o sistema supôs
  substituido_em    timestamptz,            -- outro token gravado no lugar
  ultimo_ok_em      timestamptz,            -- último uso aceito (no máx. 1x por minuto)
  recusado_em       timestamptz,            -- 1º 401 com esse token
  chamada_recusada  text                    -- rota do painel que deu o 401
);
CREATE INDEX IF NOT EXISTS ix_painel_sessao_log_painel ON public.painel_sessao_log (tabela, id_painel, login_em DESC);

CREATE OR REPLACE FUNCTION public.fn_painel_sessao_log() RETURNS trigger AS $$
DECLARE
  linha jsonb := to_jsonb(NEW);
BEGIN
  -- Acessório: erro aqui nunca impede gravar a sessão.
  BEGIN
    IF TG_OP = 'UPDATE' AND NEW.session_cookie IS DISTINCT FROM OLD.session_cookie AND OLD.session_cookie IS NOT NULL THEN
      UPDATE public.painel_sessao_log SET substituido_em = now()
       WHERE token_hash = md5(OLD.session_cookie) AND substituido_em IS NULL;
    END IF;
    IF NEW.session_cookie IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.session_cookie IS DISTINCT FROM OLD.session_cookie) THEN
      INSERT INTO public.painel_sessao_log (token_hash, tabela, id_painel, tipo, login_em, expira_previsto)
      VALUES (md5(NEW.session_cookie), TG_TABLE_NAME,
              COALESCE(linha->>'id', linha->>'id_servidor')::bigint,
              COALESCE(linha->>'tipo', linha->>'painel_tipo'),
              now(), NEW.session_expiry)
      ON CONFLICT (token_hash) DO UPDATE
        SET tabela = EXCLUDED.tabela, id_painel = EXCLUDED.id_painel, tipo = EXCLUDED.tipo,
            login_em = COALESCE(painel_sessao_log.login_em, EXCLUDED.login_em),
            expira_previsto = EXCLUDED.expira_previsto;
    ELSIF TG_OP = 'UPDATE' AND NEW.session_cookie IS NOT NULL AND NEW.session_expiry IS DISTINCT FROM OLD.session_expiry THEN
      UPDATE public.painel_sessao_log SET expira_previsto = NEW.session_expiry
       WHERE token_hash = md5(NEW.session_cookie);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'painel_sessao_log: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_painel_sessao_log ON public.painel_servidores;
CREATE TRIGGER tg_painel_sessao_log AFTER INSERT OR UPDATE OF session_cookie, session_expiry
  ON public.painel_servidores FOR EACH ROW EXECUTE FUNCTION public.fn_painel_sessao_log();

DROP TRIGGER IF EXISTS tg_painel_sessao_log ON public.servidores;
CREATE TRIGGER tg_painel_sessao_log AFTER INSERT OR UPDATE OF session_cookie, session_expiry
  ON public.servidores FOR EACH ROW EXECUTE FUNCTION public.fn_painel_sessao_log();

-- Tokens que já existiam: entram sem login_em (hora do login desconhecida).
INSERT INTO public.painel_sessao_log (token_hash, tabela, id_painel, tipo, expira_previsto)
SELECT md5(session_cookie), 'painel_servidores', id, tipo, session_expiry
  FROM public.painel_servidores WHERE session_cookie IS NOT NULL
UNION ALL
SELECT md5(session_cookie), 'servidores', id_servidor, painel_tipo, session_expiry
  FROM public.servidores WHERE session_cookie IS NOT NULL
ON CONFLICT (token_hash) DO NOTHING;
