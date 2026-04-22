-- ── Per-server moderation config (auto-mod) ──
-- Additive: servers tablosuna JSONB config kolonu.
-- Flood control cooldown/limit/window sunucu bazlı yönetilebilsin.
-- Küfür filtresi ve spam koruması alanları da aynı obje içinde (ileri faz).
--
-- Şema (örnek, zorunlu değil — chat-server missing key'lerde built-in default kullanır):
--   {
--     "flood": { "cooldownMs": 3000, "limit": 5, "windowMs": 5000 },
--     "profanity": { "enabled": false, "words": [] },
--     "spam":      { "enabled": false }
--   }
--
-- Fail-safe: moderation_config NULL veya okunamazsa chat-server hardcoded default kullanır.

ALTER TABLE servers
  ADD COLUMN IF NOT EXISTS moderation_config JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Yazma yetkisi için yeni capability: server.moderation.update
-- owner / admin / moderator: üçü de auto-mod config değiştirebilir.
-- (member.chat_ban pattern'iyle paralel — mod da moderation politikasını yönetir.)

INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, 'server.moderation.update' FROM roles r
WHERE r.is_system = true AND r.name = 'owner'
ON CONFLICT DO NOTHING;

INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, 'server.moderation.update' FROM roles r
WHERE r.is_system = true AND r.name = 'admin'
ON CONFLICT DO NOTHING;

INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, 'server.moderation.update' FROM roles r
WHERE r.is_system = true AND r.name = 'moderator'
ON CONFLICT DO NOTHING;
