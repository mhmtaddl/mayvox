CREATE TABLE IF NOT EXISTS recommendation_user_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES recommendation_items(id) ON DELETE CASCADE,
  server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_watched boolean NOT NULL DEFAULT false,
  is_watchlisted boolean NOT NULL DEFAULT false,
  watched_at timestamptz,
  watchlisted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recommendation_user_states_unique_item_user UNIQUE (item_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_recommendation_user_states_server_user
  ON recommendation_user_states (server_id, user_id);

CREATE INDEX IF NOT EXISTS idx_recommendation_user_states_item_watched
  ON recommendation_user_states (item_id, is_watched);

CREATE INDEX IF NOT EXISTS idx_recommendation_user_states_item_watchlisted
  ON recommendation_user_states (item_id, is_watchlisted);
