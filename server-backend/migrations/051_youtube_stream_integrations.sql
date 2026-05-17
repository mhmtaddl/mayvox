ALTER TABLE server_stream_integrations
  DROP CONSTRAINT IF EXISTS server_stream_integrations_platform_check;

ALTER TABLE server_stream_integrations
  ADD CONSTRAINT server_stream_integrations_platform_check
    CHECK (platform = ANY (ARRAY['twitch', 'youtube']::text[]));
