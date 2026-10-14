-- 13/10/2026: IBO Xplayer (app IBOXXPLAYER, app_id 13 na revenda IBOSOL, site do cliente iboxxiptv.com).
-- Vários estavam cadastrados como IBO Player (id_app 8) com "Xplayer" na observação: passam pro app novo.
BEGIN;
INSERT INTO public.apps (id_app, nome_app, exige_licenca, url_referencia)
VALUES (34, 'IBO Xplayer', true, 'https://iboxxiptv.com')
ON CONFLICT (id_app) DO NOTHING;
SELECT setval('apps_id_app_seq', GREATEST((SELECT max(id_app) FROM public.apps), 34));

UPDATE public.aplicativos SET id_app = 34, atualizado_em = NOW()
WHERE id_app = 8 AND observacao ~* 'x ?play';
COMMIT;
