-- ── Invite V2: link invite'lar ──
-- Hash-based, scope'lu (server/channel), expires/max_uses/revoked lifecycle.
-- Legacy tablolar (server_invites, server_user_invites) ayrı kalır:
--   - server_invites      → v1 short-code join (joinByInvite), dokunulmaz
--   - server_user_invites → v1 direct-user invite, dokunulmaz
--   - server_invite_links → v2 link invite, bu migration ile gelir

CREATE TABLE IF NOT EXISTS server_invite_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id       UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  channel_id      UUID REFERENCES channels(id) ON DELETE CASCADE,
  created_by      TEXT NOT NULL,
  scope           VARCHAR(20) NOT NULL,  -- 'server' | 'channel'
  token_hash      TEXT NOT NULL UNIQUE,   -- sha256(hex), raw token asla saklanmaz
  expires_at      TIMESTAMPTZ,
  max_uses        INT,
  used_count      INT NOT NULL DEFAULT 0,
  revoked_at      TIMESTAMPTZ,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invite_links_server  ON server_invite_links(server_id);
CREATE INDEX IF NOT EXISTS idx_invite_links_channel ON server_invite_links(channel_id);
-- token_hash zaten UNIQUE → ayrı index yok

-- Scope/sanity constraint: channel scope channel_id zorunlu, server scope channel_id null
ALTER TABLE server_invite_links
  ADD CONSTRAINT chk_invite_scope CHECK (
    (scope = 'server'  AND channel_id IS NULL) OR
    (scope = 'channel' AND channel_id IS NOT NULL)
  );
