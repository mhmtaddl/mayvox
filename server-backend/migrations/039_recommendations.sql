CREATE TABLE IF NOT EXISTS recommendation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id uuid NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL,
  description text,
  cover_url text,
  tags text[] NOT NULL DEFAULT '{}',
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  average_rating numeric(4,2) NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  comment_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recommendation_items_category_check
    CHECK (category = ANY (ARRAY['film', 'series', 'game', 'music', 'book', 'hardware']::text[])),
  CONSTRAINT recommendation_items_status_check
    CHECK (status = ANY (ARRAY['active', 'hidden', 'deleted']::text[]))
);

CREATE INDEX IF NOT EXISTS idx_recommendation_items_server_created
  ON recommendation_items (server_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recommendation_items_server_category
  ON recommendation_items (server_id, category);

CREATE INDEX IF NOT EXISTS idx_recommendation_items_server_status
  ON recommendation_items (server_id, status);

CREATE INDEX IF NOT EXISTS idx_recommendation_items_created_by
  ON recommendation_items (created_by);

CREATE INDEX IF NOT EXISTS idx_recommendation_items_tags_gin
  ON recommendation_items USING gin (tags);
