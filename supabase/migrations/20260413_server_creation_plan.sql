-- Kullanıcı bazlı sunucu oluşturma yetkisi (plan bazlı).
--
-- Değerler:
--   'none'  → sunucu oluşturamaz (varsayılan)
--   'free'  → yalnızca free plan sunucu
--   'pro'   → free + pro
--   'ultra' → tüm planlar (free + pro + ultra)
--
-- Backend `createServer` bu kolonu okuyup istenen planı gate'ler.
-- Admin'ler için UI fallback 'ultra' uygular; DB kaydı değilse override mümkün.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS server_creation_plan TEXT NOT NULL DEFAULT 'none'
    CHECK (server_creation_plan IN ('none','free','pro','ultra'));

-- Admin / primary admin kullanıcıları default olarak 'ultra' konumlansın
-- (sonradan admin panelden override edilebilir).
UPDATE profiles
   SET server_creation_plan = 'ultra'
 WHERE (is_admin = true OR is_primary_admin = true)
   AND server_creation_plan = 'none';

-- Sık sorgulandığı için hafif index (IS NOT 'none' filtreleri için).
CREATE INDEX IF NOT EXISTS idx_profiles_server_creation_plan
  ON profiles (server_creation_plan)
  WHERE server_creation_plan <> 'none';

-- ── Admin RPC: diğer kullanıcıların server_creation_plan değerini değiştirme ──
-- profiles RLS genellikle "users update own row" kuralı; admin başkasını direkt
-- güncelleyemez. Bu RPC SECURITY DEFINER ile çalışır ve caller is_admin ya da
-- is_primary_admin ise set eder.
CREATE OR REPLACE FUNCTION set_server_creation_plan(target_user_id UUID, new_plan TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_is_admin BOOLEAN;
BEGIN
  IF new_plan NOT IN ('none','free','pro','ultra') THEN
    RETURN json_build_object('error', 'invalid_plan');
  END IF;

  SELECT (is_admin OR is_primary_admin) INTO caller_is_admin
    FROM profiles WHERE id = auth.uid();

  IF NOT COALESCE(caller_is_admin, false) THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  UPDATE profiles SET server_creation_plan = new_plan WHERE id = target_user_id;
  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION set_server_creation_plan(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_server_creation_plan(UUID, TEXT) TO authenticated;
