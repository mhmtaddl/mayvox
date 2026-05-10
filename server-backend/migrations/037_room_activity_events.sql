-- Room Activity Log MVP
-- Son Olaylar eventlerini oda bazlı kısa süreli saklamak için.
-- MVP hedef:
-- - Yetkili kullanıcılar son 75 event'i okuyacak.
-- - Oda boş kaldıktan sonra backend ileride expires_at'i now()+3 hours yapacak.
-- - Cleanup ileride expires_at üzerinden yapılacak.
--
-- Not:
-- Production channels.id text olduğu için channel_id TEXT tutulur.
-- Kullanıcı id alanları audit_log ile uyumlu şekilde TEXT tutulur.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS room_activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,

  type TEXT NOT NULL,
  actor_id TEXT NULL,
  target_user_id TEXT NULL,

  label TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_room_activity_channel_time
  ON room_activity_events (server_id, channel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_room_activity_expires_at
  ON room_activity_events (expires_at)
  WHERE expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_room_activity_actor_time
  ON room_activity_events (actor_id, created_at DESC)
  WHERE actor_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_room_activity_target_time
  ON room_activity_events (target_user_id, created_at DESC)
  WHERE target_user_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'room_activity_events_type_check'
  ) THEN
    ALTER TABLE room_activity_events
      ADD CONSTRAINT room_activity_events_type_check
      CHECK (
        type IN (
          'join',
          'leave',
          'chat_lock',
          'chat_unlock',
          'chat_clear',
          'automod',
          'voice_mute',
          'voice_unmute',
          'timeout',
          'timeout_clear',
          'room_kick',
          'chat_ban',
          'chat_unban',
          'message_delete',
          'message_edit',
          'message_report',
          'settings'
        )
      );
  END IF;
END $$;
