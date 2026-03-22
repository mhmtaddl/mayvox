-- =====================================================
-- Invite Requests v2 Migration
-- Mail başarısızsa talep kaybolmaz; admin retry yapabilir.
-- Supabase Dashboard → SQL Editor'da çalıştırın.
-- =====================================================

-- 1. Yeni sütunlar: hata kaydı, deneme zamanı, gönderen admin
ALTER TABLE invite_requests
  ADD COLUMN IF NOT EXISTS last_send_error    text,
  ADD COLUMN IF NOT EXISTS last_send_attempt_at bigint,
  ADD COLUMN IF NOT EXISTS sent_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Status kısıtlamasını güncelle (pending → sending → sent/failed, retry possible)
ALTER TABLE invite_requests DROP CONSTRAINT IF EXISTS invite_requests_status_check;
ALTER TABLE invite_requests ADD CONSTRAINT invite_requests_status_check
  CHECK (status IN ('pending','sending','sent','failed','rejected','expired','used'));

-- Mevcut 'approved' kayıtları 'sent' olarak güncelle (backward compat)
UPDATE invite_requests SET status = 'sent' WHERE status = 'approved';

-- =====================================================
-- admin_send_invite_code: pending VE failed talepler için
-- Atomik kilitleme: iki admin aynı anda basarsa sadece biri işler.
-- =====================================================
CREATE OR REPLACE FUNCTION admin_send_invite_code(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req    invite_requests%ROWTYPE;
  v_now    bigint := (extract(epoch from now()) * 1000)::bigint;
  v_expires_at bigint;
  v_code   text;
  v_chars  text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  v_i      integer;
  v_rows   integer;
BEGIN
  -- Admin kontrolü
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND (is_admin = true OR is_primary_admin = true)
  ) THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  -- Önce mevcut kaydı oku (not_found kontrolü için)
  SELECT * INTO v_req FROM invite_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  -- Atomik kilitleme: sadece pending veya failed olanlara izin ver
  -- GET DIAGNOSTICS + WHERE status IN → çift tıklamaya karşı koruma
  UPDATE invite_requests
  SET
    status               = 'sending',
    sent_by              = auth.uid(),
    last_send_attempt_at = v_now,
    last_send_error      = NULL,
    updated_at           = now()
  WHERE id = p_request_id
    AND status IN ('pending', 'failed');

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows = 0 THEN
    -- Başka admin zaten işliyor ya da geçersiz durum
    SELECT status INTO v_req.status FROM invite_requests WHERE id = p_request_id;
    RETURN jsonb_build_object(
      'error', 'invalid_status',
      'current_status', v_req.status,
      'message', 'Bu talep zaten işleme alınmış.'
    );
  END IF;

  -- Her seferinde yeni kod üret (retry'da da taze kod)
  LOOP
    v_code := '';
    FOR v_i IN 1..10 LOOP
      v_code := v_code || substr(v_chars, (floor(random() * length(v_chars)))::integer + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM invite_codes WHERE code = v_code);
  END LOOP;

  v_expires_at := v_now + (5 * 60 * 1000); -- 5 dakika

  -- invite_requests kaydına kodu ve süreyi yaz
  UPDATE invite_requests
  SET code = v_code, expires_at = v_expires_at, updated_at = now()
  WHERE id = p_request_id;

  -- Bu email için kullanılmamış eski kodları temizle
  DELETE FROM invite_codes WHERE email = lower(v_req.email) AND used = false;

  -- Yeni kod ekle
  INSERT INTO invite_codes (code, created_by, expires_at, used, email)
  VALUES (v_code, auth.uid(), v_expires_at, false, lower(v_req.email))
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'ok',         true,
    'code',       v_code,
    'expires_at', v_expires_at,
    'email',      v_req.email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_send_invite_code(uuid) TO authenticated;

-- =====================================================
-- admin_mark_invite_sent: mail başarılı → 'sent'
-- =====================================================
CREATE OR REPLACE FUNCTION admin_mark_invite_sent(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND (is_admin = true OR is_primary_admin = true)
  ) THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  UPDATE invite_requests
  SET status = 'sent', updated_at = now()
  WHERE id = p_request_id AND status = 'sending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_status');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_mark_invite_sent(uuid) TO authenticated;

-- =====================================================
-- admin_mark_invite_failed: mail başarısız → 'failed' + hatayı kaydet
-- =====================================================
CREATE OR REPLACE FUNCTION admin_mark_invite_failed(p_request_id uuid, p_error text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND (is_admin = true OR is_primary_admin = true)
  ) THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  UPDATE invite_requests
  SET
    status          = 'failed',
    last_send_error = p_error,
    updated_at      = now()
  WHERE id = p_request_id AND status = 'sending';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_status');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_mark_invite_failed(uuid, text) TO authenticated;

-- =====================================================
-- get_admin_invite_requests: pending + failed + sending (+ stuck timeout)
-- Eski get_pending_invite_requests'ın yerini alır; geriye dönük compat için o da güncelleniyor.
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

  -- Süresi dolmuş pending kayıtları expire et
  UPDATE invite_requests
  SET status = 'expired', updated_at = now()
  WHERE status = 'pending'
    AND expires_at IS NOT NULL
    AND expires_at <= v_now;

  -- 2 dakikadan uzun süre 'sending' takılı kalan kayıtları failed'a düşür
  -- (admin uygulamayı kapattıysa veya ağ kesildi ise)
  UPDATE invite_requests
  SET
    status          = 'failed',
    last_send_error = 'Gönderim zaman aşımına uğradı. Lütfen tekrar deneyin.',
    updated_at      = now()
  WHERE status = 'sending'
    AND last_send_attempt_at IS NOT NULL
    AND last_send_attempt_at < (v_now - 120000); -- 2 dakika

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

-- get_pending_invite_requests eski fonksiyonu → artık get_admin_invite_requests'e yönlendir
CREATE OR REPLACE FUNCTION get_pending_invite_requests()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN get_admin_invite_requests();
END;
$$;

GRANT EXECUTE ON FUNCTION get_pending_invite_requests() TO authenticated;

-- =====================================================
-- admin_reject_invite: pending, failed VE sending kabul eder
-- =====================================================
CREATE OR REPLACE FUNCTION admin_reject_invite(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req                invite_requests%ROWTYPE;
  v_ban                invite_email_bans%ROWTYPE;
  v_now                bigint := (extract(epoch from now()) * 1000)::bigint;
  v_new_count          integer;
  v_blocked_until      bigint := NULL;
  v_permanently_blocked boolean := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND (is_admin = true OR is_primary_admin = true)
  ) THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  SELECT * INTO v_req FROM invite_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF v_req.status NOT IN ('pending', 'failed', 'sending') THEN
    RETURN jsonb_build_object('error', 'invalid_status');
  END IF;

  -- Kodu invite_codes'dan temizle (varsa)
  IF v_req.code IS NOT NULL THEN
    DELETE FROM invite_codes WHERE code = v_req.code AND used = false;
  END IF;

  UPDATE invite_requests SET status = 'rejected', updated_at = now() WHERE id = p_request_id;

  SELECT * INTO v_ban FROM invite_email_bans WHERE email = v_req.email;
  v_new_count := COALESCE(v_ban.rejection_count, 0) + 1;

  CASE v_new_count
    WHEN 1 THEN v_blocked_until := v_now + (5  * 60 * 1000);
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
    SET rejection_count       = v_new_count,
        blocked_until         = v_blocked_until,
        permanently_blocked   = v_permanently_blocked;

  RETURN jsonb_build_object(
    'ok',                 true,
    'rejection_count',    v_new_count,
    'blocked_until',      v_blocked_until,
    'permanently_blocked', v_permanently_blocked
  );
END;
$$;

GRANT EXECUTE ON FUNCTION admin_reject_invite(uuid) TO authenticated;

-- =====================================================
-- request_invite: 'sending' ve 'failed' olan talepleri de "aktif" say
-- (kullanıcı tekrar talep açamasın)
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

  -- pending, sending veya failed olan aktif talep var mı?
  SELECT * INTO v_existing
  FROM invite_requests
  WHERE email = lower(p_email)
    AND status IN ('pending', 'sending', 'failed')
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'error',      'already_pending',
      'message',    'Bu e-posta için zaten aktif bir talep mevcut.',
      'request_id', v_existing.id,
      'status',     v_existing.status,
      'expires_at', v_existing.expires_at
    );
  END IF;

  v_expires_at := v_now + (5 * 60 * 1000);

  INSERT INTO invite_requests (email, status, expires_at)
  VALUES (lower(p_email), 'pending', v_expires_at)
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'ok',         true,
    'request_id', v_request_id,
    'expires_at', v_expires_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION request_invite(text) TO anon, authenticated;
