-- =====================================================
-- Invite Request — bekleme süresi kaldırıldı
-- Pending talepler artık expire olmaz; admin onay verene kadar bekler.
-- Admin onay sonrası üretilen kodun 5 dk süresi AYNEN KALDI.
-- Supabase Dashboard → SQL Editor'da çalıştırın.
-- =====================================================

CREATE OR REPLACE FUNCTION request_invite(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ban        invite_email_bans%ROWTYPE;
  v_existing   invite_requests%ROWTYPE;
  v_now        bigint := (extract(epoch from now()) * 1000)::bigint;
  v_request_id uuid;
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
    AND status IN ('pending', 'sending', 'failed')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'error',      'already_pending',
      'message',    'Üyeliğiniz onay aşamasındadır.',
      'request_id', v_existing.id,
      'status',     v_existing.status,
      'expires_at', v_existing.expires_at
    );
  END IF;

  -- Pending talep: süresiz (expires_at NULL)
  INSERT INTO invite_requests (email, status, expires_at)
  VALUES (lower(p_email), 'pending', NULL)
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'ok',         true,
    'request_id', v_request_id,
    'expires_at', NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION request_invite(text) TO anon, authenticated;

-- =====================================================
-- get_admin_invite_requests: pending auto-expire kaldırıldı
-- (sending timeout korundu — admin tarafı stuck kalmasın)
-- =====================================================
CREATE OR REPLACE FUNCTION get_admin_invite_requests()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now    bigint := (extract(epoch from now()) * 1000)::bigint;
  v_result jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND (is_admin = true OR is_primary_admin = true)
  ) THEN
    RETURN '[]'::jsonb;
  END IF;

  -- NOT: Pending auto-expire KALDIRILDI. Talepler admin onay/red verene kadar bekler.

  -- 2 dakikadan uzun 'sending' takılı kayıtları failed'a düşür
  UPDATE invite_requests
  SET
    status          = 'failed',
    last_send_error = 'Gönderim zaman aşımına uğradı. Lütfen tekrar deneyin.',
    updated_at      = now()
  WHERE status = 'sending'
    AND last_send_attempt_at IS NOT NULL
    AND last_send_attempt_at < (v_now - 120000);

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.created_at), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      ir.id,
      ir.email,
      ir.status,
      ir.code,
      ir.expires_at,
      ir.created_at,
      ir.last_send_error,
      ir.last_send_attempt_at,
      COALESCE(ib.rejection_count, 0)          AS rejection_count,
      ib.blocked_until,
      COALESCE(ib.permanently_blocked, false)  AS permanently_blocked
    FROM invite_requests ir
    LEFT JOIN invite_email_bans ib ON ib.email = ir.email
    WHERE ir.status IN ('pending', 'failed', 'sending')
    ORDER BY ir.created_at ASC
  ) r;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_admin_invite_requests() TO authenticated;
