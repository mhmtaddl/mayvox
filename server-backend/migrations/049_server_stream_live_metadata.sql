ALTER TABLE server_stream_links
  ADD COLUMN IF NOT EXISTS live_title text,
  ADD COLUMN IF NOT EXISTS viewer_count integer,
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS live_started_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_server_stream_links_last_checked
  ON server_stream_links (platform, enabled, last_checked_at);
