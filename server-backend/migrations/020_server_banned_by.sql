-- ── Restricted server: kim kısıtladı bilgisi ──
-- Owner'a görünen "kim ne zaman ne sebeple" trio'sunu tamamla.
ALTER TABLE servers
  ADD COLUMN IF NOT EXISTS banned_by TEXT;

CREATE INDEX IF NOT EXISTS idx_servers_banned_by
  ON servers (banned_by)
  WHERE banned_by IS NOT NULL;
