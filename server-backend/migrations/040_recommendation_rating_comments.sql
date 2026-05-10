CREATE TABLE IF NOT EXISTS recommendation_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES recommendation_items(id) ON DELETE CASCADE,
  server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  score numeric(3,1) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recommendation_ratings_unique_item_user UNIQUE (item_id, user_id),
  CONSTRAINT recommendation_ratings_score_check CHECK (score >= 0 AND score <= 10)
);

CREATE TABLE IF NOT EXISTS recommendation_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES recommendation_items(id) ON DELETE CASCADE,
  server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  is_spoiler boolean NOT NULL DEFAULT false,
  is_hidden boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recommendation_comments_unique_item_user UNIQUE (item_id, user_id),
  CONSTRAINT recommendation_comments_body_check CHECK (length(trim(body)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_recommendation_ratings_item
  ON recommendation_ratings (item_id);

CREATE INDEX IF NOT EXISTS idx_recommendation_ratings_server
  ON recommendation_ratings (server_id);

CREATE INDEX IF NOT EXISTS idx_recommendation_comments_item_created
  ON recommendation_comments (item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recommendation_comments_server
  ON recommendation_comments (server_id);

CREATE INDEX IF NOT EXISTS idx_recommendation_comments_user
  ON recommendation_comments (user_id);
