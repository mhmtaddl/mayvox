-- Sunuculara slug (adres) alanı ekle
ALTER TABLE servers ADD COLUMN slug VARCHAR(24) UNIQUE;

-- Mevcut sunuculara invite_code'dan slug ata
UPDATE servers SET slug = LOWER(invite_code) WHERE slug IS NULL;

-- NOT NULL yap
ALTER TABLE servers ALTER COLUMN slug SET NOT NULL;

CREATE INDEX idx_servers_slug ON servers(slug);
