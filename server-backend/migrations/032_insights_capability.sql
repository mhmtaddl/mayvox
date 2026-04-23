-- ══════════════════════════════════════════════════════════════════════════
-- Migration 032 — insights.view capability
--
-- Voice Activity / Insights dashboard'ına erişim için yeni capability.
-- Grant: owner, super_admin, admin, super_mod (moderasyon yetkisi olan roller)
--
-- NOT: Bu migration'dan önce capabilities.ts güncellenmeli — aksi halde
-- capabilitySync backend startup'ta drift uyarısı verir.
--
-- Uygulama: Hetzner manuel psql
--   psql "$DATABASE_URL" --single-transaction -e -f migrations/032_insights_capability.sql
--   psql "$DATABASE_URL" -c "INSERT INTO _migrations (name, applied_at) VALUES ('032_insights_capability.sql', now()) ON CONFLICT DO NOTHING;"
-- ══════════════════════════════════════════════════════════════════════════

INSERT INTO role_capabilities (role_id, capability)
SELECT r.id, 'insights.view'
FROM roles r
WHERE r.is_system = true
  AND r.name IN ('owner', 'super_admin', 'admin', 'super_mod')
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- VERIFICATION:
--
--   -- Her sunucuda 4 role × insights.view grant edildi mi?
--   SELECT r.name, COUNT(*) AS server_count
--   FROM role_capabilities rc
--   JOIN roles r ON r.id = rc.role_id
--   WHERE r.is_system = true AND rc.capability = 'insights.view'
--   GROUP BY r.name
--   ORDER BY r.name;
--   -- Beklenen: 4 satır (admin, owner, super_admin, super_mod), her biri total_server sayısı
--
-- ══════════════════════════════════════════════════════════════════════════
