-- Realtime DELETE olaylarının düzgün çalışması için REPLICA IDENTITY FULL gerekli
-- (varsayılan DEFAULT sadece primary key gönderir, ama realtime filter'lar tüm satır bilgisine ihtiyaç duyar)
ALTER TABLE public.announcements REPLICA IDENTITY FULL;
