CREATE TABLE IF NOT EXISTS server_stream_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  platform text NOT NULL,
  channel_url text NOT NULL,
  channel_name text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  live_status boolean NOT NULL DEFAULT false,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT server_stream_links_platform_check
    CHECK (platform = ANY (ARRAY['twitch', 'youtube', 'kick']::text[])),
  CONSTRAINT server_stream_links_unique_user_platform
    UNIQUE (server_id, user_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_server_stream_links_server
  ON server_stream_links (server_id, enabled, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_server_stream_links_user
  ON server_stream_links (user_id);
