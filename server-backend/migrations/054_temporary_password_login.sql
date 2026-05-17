ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS temp_password_hash TEXT,
  ADD COLUMN IF NOT EXISTS temp_password_expires_at TIMESTAMPTZ;
