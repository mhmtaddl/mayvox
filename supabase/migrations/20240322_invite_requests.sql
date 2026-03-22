-- =====================================================
-- Invite Requests System Migration
-- Supabase Dashboard'dan SQL Editor'da çalıştırın.
-- =====================================================

-- 1. invite_codes tablosuna email kolonu ekle (backward compat)
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS email text;

-- 2. invite_requests tablosu
CREATE TABLE IF NOT EXISTS invite_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  -- status: 'pending' | 'approved' | 'rejected' | 'expired' | 'used'
  code text,
  expires_at bigint, -- ms since epoch
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invite_requests_email ON invite_requests(email);
CREATE INDEX IF NOT EXISTS idx_invite_requests_status ON invite_requests(status);
CREATE INDEX IF NOT EXISTS idx_invite_requests_created ON invite_requests(created_at DESC);

-- 3. invite_email_bans tablosu (email başına ret sayısı/engel)
CREATE TABLE IF NOT EXISTS invite_email_bans (
  email text PRIMARY KEY,
  rejection_count integer NOT NULL DEFAULT 0,
  blocked_until bigint,
  permanently_blocked boolean NOT NULL DEFAULT false
);

-- 4. RLS aktif et
ALTER TABLE invite_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_email_bans ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
DROP POLICY IF EXISTS "admins_read_invite_requests" ON invite_requests;
CREATE POLICY "admins_read_invite_requests" ON invite_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND (is_admin = true OR is_primary_admin = true)
    )
  );

DROP POLICY IF EXISTS "admins_update_invite_requests" ON invite_requests;
CREATE POLICY "admins_update_invite_requests" ON invite_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND (is_admin = true OR is_primary_admin = true)
    )
  );

DROP POLICY IF EXISTS "admins_read_invite_bans" ON invite_email_bans;
CREATE POLICY "admins_read_invite_bans" ON invite_email_bans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND (is_admin = true OR is_primary_admin = true)
    )
  );

-- 6. Realtime için yayına ekle
ALTER PUBLICATION supabase_realtime ADD TABLE invite_requests;

-- =====================================================
-- RPC Functions
-- =====================================================

-- request_invite: anon tarafından çağrılabilir
CREATE OR REPLACE FUNCTION request_invite(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ban invite_email_bans%ROWTYPE;
  v_existing invite_requests%ROWTYPE;
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
  v_request_id uuid;
  v_expires_at bigint;
BEGIN
  IF p_email !~ '^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$' THEN
    RETURN jsonb_build_object('error', 'invalid_email', 'message', 'Geçersiz e-posta formatı.');
  END IF;

  SELECT * INTO v_ban FROM invite_email_bans WHERE email = lower(p_email);
  IF FOUND THEN
    IF v_ban.permanently_blocked THEN
      RETURN jsonb_build_object(
        'error', 'permanently_blocked',
        'message', 'Bu e-posta adresi kalıcı olarak engellenmiştir.',
        'rejection_count', v_ban.rejection_count
      );
    END IF;
    IF v_ban.blocked_until IS NOT NULL AND v_ban.blocked_until > v_now THEN
      RETURN jsonb_build_object(
        'error', 'temporarily_blocked',
        'message', 'Bu e-posta geçici olarak engellenmiştir.',
        'blocked_until', v_ban.blocked_until,
        'rejection_count', v_ban.rejection_count
      );
    END IF;
  END IF;

  SELECT * INTO v_existing
  FROM invite_requests
  WHERE email = lower(p_email)
    AND status IN ('pending', 'approved')
    AND (expires_at IS NULL OR expires_at > v_now)
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'error', 'already_pending',
      'message', 'Bu e-posta için zaten aktif bir talep mevcut.',
      'request_id', v_existing.id,
      'status', v_existing.status,
      'expires_at', v_existing.expires_at
    );
  END IF;

  v_expires_at := v_now + (5 * 60 * 1000);

  INSERT INTO invite_requests (email, status, expires_at)
  VALUES (lower(p_email), 'pending', v_expires_at)
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'ok', true,
    'request_id', v_request_id,
    'expires_at', v_expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION request_invite(text) TO anon, authenticated;

-- get_invite_request_status: anon çağırabilir (UUID capability token)
CREATE OR REPLACE FUNCTION get_invite_request_status(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req invite_requests%ROWTYPE;
  v_ban invite_email_bans%ROWTYPE;
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
BEGIN
  SELECT * INTO v_req FROM invite_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF v_req.status = 'pending' AND v_req.expires_at IS NOT NULL AND v_req.expires_at <= v_now THEN
    UPDATE invite_requests SET status = 'expired', updated_at = now() WHERE id = p_request_id;
    v_req.status := 'expired';
  END IF;

  SELECT * INTO v_ban FROM invite_email_bans WHERE email = v_req.email;

  RETURN jsonb_build_object(
    'status', v_req.status,
    'email', v_req.email,
    'expires_at', v_req.expires_at,
    'rejection_count', COALESCE(v_ban.rejection_count, 0),
    'blocked_until', v_ban.blocked_until,
    'permanently_blocked', COALESCE(v_ban.permanently_blocked, false)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_invite_request_status(uuid) TO anon, authenticated;

-- admin_send_invite_code: sadece admin
-- Race condition koruması: atomik UPDATE WHERE status='pending' → 0 row = başkası aldı
CREATE OR REPLACE FUNCTION admin_send_invite_code(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req invite_requests%ROWTYPE;
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
  v_expires_at bigint;
  v_code text;
  v_chars text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  v_i integer;
  v_rows_affected integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (is_admin = true OR is_primary_admin = true)
  ) THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  -- Kaydın var olup olmadığını kontrol et
  SELECT * INTO v_req FROM invite_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  -- Unique kod üret
  LOOP
    v_code := '';
    FOR v_i IN 1..10 LOOP
      v_code := v_code || substr(v_chars, (floor(random() * length(v_chars)))::integer + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM invite_codes WHERE code = v_code);
  END LOOP;

  v_expires_at := v_now + (5 * 60 * 1000);

  -- Atomik UPDATE: WHERE status='pending' garantisi → 2 admin aynı anda basarsa
  -- sadece biri 1 row etkiler, diğeri 0 row alır ve 'already_processed' döner
  UPDATE invite_requests
  SET status = 'approved', code = v_code, expires_at = v_expires_at, updated_at = now()
  WHERE id = p_request_id AND status = 'pending';

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
    -- Başka bir admin zaten işlem yapmış
    SELECT * INTO v_req FROM invite_requests WHERE id = p_request_id;
    RETURN jsonb_build_object(
      'error', 'invalid_status',
      'current_status', v_req.status,
      'message', 'Bu talep zaten işleme alınmış.'
    );
  END IF;

  INSERT INTO invite_codes (code, created_by, expires_at, used, email)
  VALUES (v_code, auth.uid(), v_expires_at, false, v_req.email)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'code', v_code,
    'expires_at', v_expires_at,
    'email', v_req.email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_send_invite_code(uuid) TO authenticated;

-- admin_reject_invite: sadece admin
CREATE OR REPLACE FUNCTION admin_reject_invite(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req invite_requests%ROWTYPE;
  v_ban invite_email_bans%ROWTYPE;
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
  v_new_count integer;
  v_blocked_until bigint := NULL;
  v_permanently_blocked boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (is_admin = true OR is_primary_admin = true)
  ) THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT * INTO v_req FROM invite_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF v_req.status NOT IN ('pending', 'approved') THEN
    RETURN jsonb_build_object('error', 'invalid_status');
  END IF;

  UPDATE invite_requests SET status = 'rejected', updated_at = now() WHERE id = p_request_id;

  SELECT * INTO v_ban FROM invite_email_bans WHERE email = v_req.email;
  IF FOUND THEN
    v_new_count := v_ban.rejection_count + 1;
  ELSE
    v_new_count := 1;
  END IF;

  CASE v_new_count
    WHEN 1 THEN v_blocked_until := v_now + (5 * 60 * 1000);
    WHEN 2 THEN v_blocked_until := v_now + (10 * 60 * 1000);
    WHEN 3 THEN v_blocked_until := v_now + (15 * 60 * 1000);
    WHEN 4 THEN v_blocked_until := v_now + (24 * 60 * 60 * 1000);
    ELSE
      v_permanently_blocked := true;
      v_blocked_until := NULL;
  END CASE;

  INSERT INTO invite_email_bans (email, rejection_count, blocked_until, permanently_blocked)
  VALUES (v_req.email, v_new_count, v_blocked_until, v_permanently_blocked)
  ON CONFLICT (email) DO UPDATE
  SET rejection_count = v_new_count,
      blocked_until = v_blocked_until,
      permanently_blocked = v_permanently_blocked;

  RETURN jsonb_build_object(
    'ok', true,
    'rejection_count', v_new_count,
    'blocked_until', v_blocked_until,
    'permanently_blocked', v_permanently_blocked
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reject_invite(uuid) TO authenticated;

-- get_pending_invite_requests: sadece admin
CREATE OR REPLACE FUNCTION get_pending_invite_requests()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
  v_result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (is_admin = true OR is_primary_admin = true)
  ) THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  UPDATE invite_requests
  SET status = 'expired', updated_at = now()
  WHERE status = 'pending'
    AND expires_at IS NOT NULL
    AND expires_at <= v_now;

  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      ir.id,
      ir.email,
      ir.status,
      ir.expires_at,
      ir.created_at,
      COALESCE(ib.rejection_count, 0) AS rejection_count,
      ib.blocked_until,
      COALESCE(ib.permanently_blocked, false) AS permanently_blocked
    FROM invite_requests ir
    LEFT JOIN invite_email_bans ib ON ib.email = ir.email
    WHERE ir.status IN ('pending', 'approved')
      AND (ir.expires_at IS NULL OR ir.expires_at > v_now)
    ORDER BY ir.created_at ASC
  ) r;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_pending_invite_requests() TO authenticated;

-- verify_invite_code_for_email: email bağlamalı doğrulama (anon)
CREATE OR REPLACE FUNCTION verify_invite_code_for_email(p_code text, p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM invite_codes
    WHERE code = upper(p_code)
      AND used = false
      AND expires_at > v_now
      AND (email IS NULL OR lower(email) = lower(p_email))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION verify_invite_code_for_email(text, text) TO anon, authenticated;

-- use_invite_code_for_email: kodu kullanıldı olarak işaretle (anon)
CREATE OR REPLACE FUNCTION use_invite_code_for_email(p_code text, p_email text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now bigint := (extract(epoch from now()) * 1000)::bigint;
  v_code_email text;
BEGIN
  SELECT email INTO v_code_email
  FROM invite_codes
  WHERE code = upper(p_code)
    AND used = false
    AND expires_at > v_now;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_code_email IS NOT NULL AND lower(v_code_email) != lower(p_email) THEN
    RETURN false;
  END IF;

  UPDATE invite_codes SET used = true WHERE code = upper(p_code);

  UPDATE invite_requests
  SET status = 'used', updated_at = now()
  WHERE code = upper(p_code);

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION use_invite_code_for_email(text, text) TO anon, authenticated;
