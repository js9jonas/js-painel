-- Migration 003: vincula aplicativos à conta do painel (painel_servidores)
ALTER TABLE aplicativos
  ADD COLUMN IF NOT EXISTS id_painel_servidor bigint REFERENCES painel_servidores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_aplicativos_painel_servidor ON aplicativos(id_painel_servidor);
CREATE INDEX IF NOT EXISTS idx_aplicativos_mac ON aplicativos(mac);
