-- 044_room_music.sql
-- MAYVox Music / Room Embedded Music Layer metadata skeleton.
-- Streaming, LiveKit publishing and worker runtime are intentionally not part of this migration.

BEGIN;

CREATE TABLE IF NOT EXISTS music_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  mood TEXT NULL,
  category TEXT NULL,
  source_type TEXT NOT NULL,
  source_url TEXT NULL,
  artwork_url TEXT NULL,
  duration_ms INTEGER NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT music_sources_source_type_check
    CHECK (source_type IN ('mayvox_mood', 'mayvox_radio', 'royalty_free_url', 'licensed_provider')),
  CONSTRAINT music_sources_duration_ms_check
    CHECK (duration_ms IS NULL OR duration_ms >= 0)
);

CREATE INDEX IF NOT EXISTS idx_music_sources_enabled ON music_sources(is_enabled);
CREATE INDEX IF NOT EXISTS idx_music_sources_category ON music_sources(category);
CREATE INDEX IF NOT EXISTS idx_music_sources_mood ON music_sources(mood);

CREATE TABLE IF NOT EXISTS room_music_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'stopped',
  current_source_id UUID NULL REFERENCES music_sources(id) ON DELETE SET NULL,
  started_by UUID NULL REFERENCES profiles(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NULL,
  paused_at TIMESTAMPTZ NULL,
  position_ms INTEGER NOT NULL DEFAULT 0,
  volume INTEGER NOT NULL DEFAULT 70,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT room_music_sessions_server_channel_unique UNIQUE (server_id, channel_id),
  CONSTRAINT room_music_sessions_status_check
    CHECK (status IN ('playing', 'paused', 'stopped')),
  CONSTRAINT room_music_sessions_position_ms_check
    CHECK (position_ms >= 0),
  CONSTRAINT room_music_sessions_volume_check
    CHECK (volume >= 0 AND volume <= 100)
);

CREATE INDEX IF NOT EXISTS idx_room_music_sessions_server_channel ON room_music_sessions(server_id, channel_id);
CREATE INDEX IF NOT EXISTS idx_room_music_sessions_source ON room_music_sessions(current_source_id);
CREATE INDEX IF NOT EXISTS idx_room_music_sessions_status ON room_music_sessions(status);

CREATE TABLE IF NOT EXISTS room_music_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES room_music_sessions(id) ON DELETE CASCADE,
  source_id UUID NOT NULL REFERENCES music_sources(id) ON DELETE CASCADE,
  requested_by UUID NULL REFERENCES profiles(id) ON DELETE SET NULL,
  requested_by_member_tier TEXT NULL,
  priority_score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT room_music_queue_status_check
    CHECK (status IN ('queued', 'playing', 'played', 'skipped', 'removed')),
  CONSTRAINT room_music_queue_position_check
    CHECK (position >= 0)
);

CREATE INDEX IF NOT EXISTS idx_room_music_queue_session_status_position
  ON room_music_queue(session_id, status, position);
CREATE INDEX IF NOT EXISTS idx_room_music_queue_requested_by ON room_music_queue(requested_by);
CREATE INDEX IF NOT EXISTS idx_room_music_queue_priority ON room_music_queue(priority_score DESC);

COMMIT;
