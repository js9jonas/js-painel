-- 017 — último acesso da TV à lista (13/10/2026)
--
-- SmartOne mostra na lista de aparelhos a coluna "Date Fetched": o dia em que a TV buscou a playlist
-- pela última vez. Gravada pelo sync do SmartOne e pelo botão "Atualizar" (um aparelho só); exibida em
-- /clientes/[id] na coluna Playlists. NULL = nunca lido ou app sem essa informação.
ALTER TABLE public.aplicativos ADD COLUMN IF NOT EXISTS lista_acessada_em date;
