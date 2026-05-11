ALTER TABLE announcements
  ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES servers(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_announcements_server_active
  ON announcements(server_id, is_active, is_pinned, created_at DESC);
