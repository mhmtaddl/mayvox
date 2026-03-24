-- ============================================================
-- Announcements tablosuna etkinlik desteği ekle
-- ============================================================

-- type: 'announcement' (varsayılan) veya 'event'
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'announcement'
    CHECK (type IN ('announcement', 'event'));

-- Etkinlik spesifik alanlar
ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS event_date timestamptz,
  ADD COLUMN IF NOT EXISTS participation_time text,
  ADD COLUMN IF NOT EXISTS participation_requirements text;
