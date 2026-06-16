-- Migration 002: adiciona modelo em aplicativos e cria tabela de playlists

ALTER TABLE aplicativos
  ADD COLUMN IF NOT EXISTS modelo varchar(20);

CREATE TABLE IF NOT EXISTS aplicativo_playlists (
  id                    bigserial PRIMARY KEY,
  id_app_registro       bigint        NOT NULL REFERENCES aplicativos(id_app_registro) ON DELETE CASCADE,
  playlist_id_externo   bigint,
  nome                  varchar(255),
  url                   text,
  is_selected           boolean       NOT NULL DEFAULT false,
  expired_date          timestamptz,
  id_conta              bigint        REFERENCES contas(id_conta) ON DELETE SET NULL,
  criado_em             timestamptz   NOT NULL DEFAULT now(),
  atualizado_em         timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ap_id_app_registro ON aplicativo_playlists(id_app_registro);
CREATE INDEX IF NOT EXISTS idx_ap_id_conta        ON aplicativo_playlists(id_conta);

-- Adicionado em seguida à criação da tabela (via ALTER separado):
-- ALTER TABLE aplicativo_playlists ADD CONSTRAINT uq_ap_registro_externo UNIQUE (id_app_registro, playlist_id_externo);
