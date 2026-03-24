-- ============================================================
-- 1) Moderatör rolü: profiles tablosuna is_moderator ekle
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_moderator boolean NOT NULL DEFAULT false;

-- ============================================================
-- 2) toggle_moderator RPC (SECURITY DEFINER)
--    Sadece primary admin çağırabilir.
-- ============================================================
CREATE OR REPLACE FUNCTION public.toggle_moderator(target_user_id uuid, new_value boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_is_primary boolean;
BEGIN
  SELECT is_primary_admin INTO caller_is_primary
    FROM profiles WHERE id = auth.uid();

  IF caller_is_primary IS NOT TRUE THEN
    RETURN jsonb_build_object('error', 'Yetkiniz yok');
  END IF;

  UPDATE profiles SET is_moderator = new_value WHERE id = target_user_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- 3) Announcements tablosu
-- ============================================================
CREATE TABLE IF NOT EXISTS public.announcements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  content     text NOT NULL DEFAULT '',
  author_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_name text NOT NULL DEFAULT '',
  is_pinned   boolean NOT NULL DEFAULT false,
  priority    text NOT NULL DEFAULT 'normal'
                CHECK (priority IN ('normal', 'important', 'critical')),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- updated_at otomatik güncelleme
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_announcements_updated_at ON public.announcements;
CREATE TRIGGER trg_announcements_updated_at
  BEFORE UPDATE ON public.announcements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 4) RLS policies
-- ============================================================
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Herkes aktif duyuruları okuyabilir
CREATE POLICY announcements_select ON public.announcements
  FOR SELECT USING (is_active = true);

-- Admin veya moderatör ekleyebilir
CREATE POLICY announcements_insert ON public.announcements
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND (is_admin = true OR is_moderator = true)
    )
  );

-- Admin herşeyi düzenleyebilir; moderatör sadece kendininkileri
CREATE POLICY announcements_update ON public.announcements
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND (is_admin = true OR (is_moderator = true AND announcements.author_id = auth.uid()))
    )
  );

-- Admin herşeyi silebilir; moderatör sadece kendininkileri
CREATE POLICY announcements_delete ON public.announcements
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND (is_admin = true OR (is_moderator = true AND announcements.author_id = auth.uid()))
    )
  );

-- ============================================================
-- 5) Realtime etkinleştir
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
