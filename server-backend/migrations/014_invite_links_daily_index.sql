-- ── Invite daily-count query için composite index ──
-- Hot path: planService.checkLimit('invite.createLink') günde birden çok kez çağrılır.
-- Query: WHERE server_id = $1 AND created_at > now() - interval '24 hours'
-- Mevcut idx_invite_links_server (server_id) yeterli değil — created_at filtresi için
-- composite index gerekiyor. DESC ordering çoğu "son 24h" sorgusunda scan'i azaltır.

CREATE INDEX IF NOT EXISTS idx_invite_links_server_created
  ON server_invite_links (server_id, created_at DESC);
