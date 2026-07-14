-- Migration 006: host de streaming (M3U/Xtream) entregue ao cliente final,
-- separado de url_painel (acesso humano ao painel de revenda) e url_api (endpoint fixo no adapter)
ALTER TABLE public.painel_servidores ADD COLUMN IF NOT EXISTS host_stream TEXT;

UPDATE public.painel_servidores SET host_stream = 'http://techonline.me'      WHERE tipo = 'club';
UPDATE public.painel_servidores SET host_stream = 'http://bandeira5.info'     WHERE tipo = 'central';
UPDATE public.painel_servidores SET host_stream = 'http://monitor3.cfd'       WHERE tipo = 'uniplay';
UPDATE public.painel_servidores SET host_stream = 'http://bandeiraf.vip'      WHERE tipo = 'fast';
UPDATE public.painel_servidores SET host_stream = 'http://p.ctultra.cc:8880'  WHERE tipo = 'now';
UPDATE public.painel_servidores SET host_stream = 'http://gm08.top'           WHERE tipo = 'natv';
UPDATE public.painel_servidores SET host_stream = 'http://vxplay.sbs:80'      WHERE tipo = 'liebe';
-- unitv fica sem host_stream (app próprio, sem link M3U)
