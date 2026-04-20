-- ── Moderation voice actions: mute / timeout / room_kick ──
-- Additive: mevcut is_muted alanını BOZMUYORUZ (o sistem yönetimi mute'u).
-- Yeni alanlar mod/admin/owner tarafından kullanılacak sunucu-içi voice ceza alanları.
--
-- Semantikler:
--   voice_muted_*        → süreli/süresiz voice mute (mesaj etkilenmez)
--   timeout_until        → mesaj + voice join + aktif voice düşürme (Discord-vari)
--   room_kick            → kalıcı alan yok, tek seferlik LiveKit removeParticipant (audit_log'a kayıt)

ALTER TABLE server_members
  ADD COLUMN IF NOT EXISTS voice_muted_by        TEXT,
  ADD COLUMN IF NOT EXISTS voice_muted_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voice_mute_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timeout_until         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS timeout_set_by        TEXT,
  ADD COLUMN IF NOT EXISTS timeout_set_at        TIMESTAMPTZ;

-- Expiry scan için partial index (sadece aktif cezaları indeksle)
CREATE INDEX IF NOT EXISTS idx_members_voice_mute_expires
  ON server_members (voice_mute_expires_at)
  WHERE voice_mute_expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_members_timeout_until
  ON server_members (timeout_until)
  WHERE timeout_until IS NOT NULL;

-- ── Yeni capability'leri sistem rollerine grant et ──
-- owner / admin / moderator: üçü de voice moderation yapabilir.
-- member: yok.

-- owner
INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c FROM roles r
CROSS JOIN (VALUES
  ('member.mute'),
  ('member.timeout'),
  ('member.room_kick')
) AS caps(c)
WHERE r.is_system = true AND r.name = 'owner'
ON CONFLICT DO NOTHING;

-- admin
INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c FROM roles r
CROSS JOIN (VALUES
  ('member.mute'),
  ('member.timeout'),
  ('member.room_kick')
) AS caps(c)
WHERE r.is_system = true AND r.name = 'admin'
ON CONFLICT DO NOTHING;

-- moderator
INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, c FROM roles r
CROSS JOIN (VALUES
  ('member.mute'),
  ('member.timeout'),
  ('member.room_kick')
) AS caps(c)
WHERE r.is_system = true AND r.name = 'moderator'
ON CONFLICT DO NOTHING;
