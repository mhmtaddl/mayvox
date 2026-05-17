CREATE TABLE IF NOT EXISTS server_stream_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  platform text NOT NULL,
  client_id text NOT NULL DEFAULT '',
  client_secret text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT server_stream_integrations_platform_check
    CHECK (platform = ANY (ARRAY['twitch']::text[])),
  CONSTRAINT server_stream_integrations_unique_platform
    UNIQUE (server_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_server_stream_integrations_server
  ON server_stream_integrations (server_id, platform, enabled);
