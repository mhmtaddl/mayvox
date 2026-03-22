-- Supabase Dashboard > SQL Editor'da çalıştır
-- admin_send_invite_code fonksiyonunu race condition korumasıyla günceller

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

  SELECT * INTO v_req FROM invite_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  LOOP
    v_code := '';
    FOR v_i IN 1..10 LOOP
      v_code := v_code || substr(v_chars, (floor(random() * length(v_chars)))::integer + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM invite_codes WHERE code = v_code);
  END LOOP;

  v_expires_at := v_now + (5 * 60 * 1000);

  -- Atomik UPDATE: sadece status='pending' ise güncelle
  UPDATE invite_requests
  SET status = 'approved', code = v_code, expires_at = v_expires_at, updated_at = now()
  WHERE id = p_request_id AND status = 'pending';

  GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

  IF v_rows_affected = 0 THEN
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
