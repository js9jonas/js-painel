-- 015 — hosts de cada servidor IPTV (11/10/2026)
--
-- Um servidor (painel_servidores) pode ter vários endereços de lista. Um deles é o PRINCIPAL — o usado
-- para montar credenciais e listas novas; ele é espelhado em painel_servidores.host_stream, que o resto
-- do sistema já lê. SECUNDÁRIO = endereço que ainda funciona (ex.: onde ficaram as listas ocultas dos
-- apps depois da migração em massa); INATIVO = endereço que não usamos mais, guardado só para reconhecer
-- listas antigas. Hosts achados nas playlists que não estão aqui aparecem como "desconhecidos" em /conexoes.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.servidor_hosts (
  id                  serial PRIMARY KEY,
  id_painel_servidor  integer     NOT NULL REFERENCES public.painel_servidores(id) ON DELETE CASCADE,
  host                text        NOT NULL,
  papel               text        NOT NULL CHECK (papel IN ('principal', 'secundario', 'inativo')),
  observacao          text,
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now()
);

-- um endereço pertence a um servidor só
CREATE UNIQUE INDEX IF NOT EXISTS ux_servidor_hosts_host ON public.servidor_hosts (lower(host));
-- no máximo um principal por servidor
CREATE UNIQUE INDEX IF NOT EXISTS ux_servidor_hosts_principal ON public.servidor_hosts (id_painel_servidor) WHERE papel = 'principal';

-- carga inicial: o host_stream atual de cada servidor vira o principal
INSERT INTO public.servidor_hosts (id_painel_servidor, host, papel)
SELECT ps.id, regexp_replace(trim(ps.host_stream), '/+$', ''), 'principal'
  FROM public.painel_servidores ps
 WHERE ps.host_stream IS NOT NULL AND trim(ps.host_stream) <> ''
ON CONFLICT DO NOTHING;

-- secundários já conhecidos (listas ocultas dos apps ficaram nesses endereços)
INSERT INTO public.servidor_hosts (id_painel_servidor, host, papel, observacao)
SELECT ps.id, v.host, 'secundario', v.obs
  FROM (VALUES
    ('fast',    'http://bandeiraf.vip',  'Listas ocultas do Fun Play (migração de 11/10/2026)'),
    ('central', 'http://bandeira5.info', 'Listas ocultas do Fun Play (migração de 11/10/2026)')
  ) AS v(tipo, host, obs)
  JOIN public.painel_servidores ps ON ps.tipo = v.tipo AND ps.host_stream IS NOT NULL
ON CONFLICT DO NOTHING;
