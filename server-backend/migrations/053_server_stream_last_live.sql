ALTER TABLE server_stream_links
  ADD COLUMN IF NOT EXISTS last_live_title text,
  ADD COLUMN IF NOT EXISTS last_live_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_live_ended_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_server_stream_links_last_live_ended
  ON server_stream_links (server_id, last_live_ended_at DESC)
  WHERE last_live_ended_at IS NOT NULL;
