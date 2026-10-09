-- 014 — chave real do aparelho × número interno do painel (08/10/2026)
--
-- Desde 15/06/2026 (dc6c622) o sync de painéis de app gravava o NÚMERO INTERNO do aparelho no
-- painel (FunPlay/LazerPlay/CorePlayer: device.id; SmartOne: smartkey id) na coluna `chave`,
-- apagando a chave real ("Device Key" da TV, pedida pelo "add existing device"). A partir daqui:
--   - `id_dispositivo_painel`: o número interno (usado só pelo sistema: playlists ao vivo, editar playlist);
--   - `chave`: volta a ser a chave real — o sync a recupera do próprio painel;
--   - `chave_anterior` / `chave_mudou_em`: quando a chave real muda no painel (descobrir se o FunPlay rotaciona).
--
-- Idempotente. O preenchimento abaixo só copia o que o último sync gravou em `chave` (o número interno)
-- pros aparelhos ligados a um painel — assim nada para de funcionar entre o deploy e o próximo sync.

ALTER TABLE public.aplicativos ADD COLUMN IF NOT EXISTS id_dispositivo_painel bigint NULL;
ALTER TABLE public.aplicativos ADD COLUMN IF NOT EXISTS chave_anterior varchar NULL;
ALTER TABLE public.aplicativos ADD COLUMN IF NOT EXISTS chave_mudou_em timestamptz NULL;

UPDATE public.aplicativos
   SET id_dispositivo_painel = chave::bigint
 WHERE id_dispositivo_painel IS NULL
   AND id_painel_servidor IS NOT NULL
   AND removido_em IS NULL
   AND chave ~ '^[0-9]{1,15}$';
