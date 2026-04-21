-- ── Moderation chat ban: sunucu text odalarında mesaj yasağı ──
-- Additive: migration 023 pattern'i ile paralel. Voice mute / timeout'tan bağımsız.
--
-- Semantik:
--   chat_banned_*         → sunucu text odalarında mesaj gönderemez (voice etkilenmez)
--   Voice mute / timeout  → ayrı sistemler, chat ban ile çakışmaz

ALTER TABLE server_members
  ADD COLUMN IF NOT EXISTS chat_banned_by        TEXT,
  ADD COLUMN IF NOT EXISTS chat_banned_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS chat_ban_expires_at   TIMESTAMPTZ;

-- Expiry scan için partial index (sadece aktif chat ban'leri indeksle)
CREATE INDEX IF NOT EXISTS idx_members_chat_ban_expires
  ON server_members (chat_ban_expires_at)
  WHERE chat_ban_expires_at IS NOT NULL;

-- ── member.chat_ban capability'sini sistem rollerine grant et ──
-- owner / admin / moderator: üçü de chat ban uygulayabilir.

-- owner
INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, 'member.chat_ban' FROM roles r
WHERE r.is_system = true AND r.name = 'owner'
ON CONFLICT DO NOTHING;

-- admin
INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, 'member.chat_ban' FROM roles r
WHERE r.is_system = true AND r.name = 'admin'
ON CONFLICT DO NOTHING;

-- moderator
INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, 'member.chat_ban' FROM roles r
WHERE r.is_system = true AND r.name = 'moderator'
ON CONFLICT DO NOTHING;
