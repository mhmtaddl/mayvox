-- ── Admin plan source + duration (Supabase profiles) ──
-- Bu dosya backend DB'ye DEĞİL, Supabase SQL editor'de çalıştırılır.
-- Backend DB'ye çalıştırılmaya izin verilmemesi için guard clause ekliyoruz:
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE NOTICE 'profiles tablosu yok; bu migration SUPABASE SQL EDITOR''de çalıştırılmalı. Backend DB''de skip.';
    RETURN;
  END IF;

  -- plan_source: 'manual' (admin verdi) | 'paid' (kullanıcı satın aldı) | NULL (plan yok veya eski veri)
  EXECUTE '
    ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS server_creation_plan_source TEXT
        CHECK (server_creation_plan_source IN (''manual'',''paid'') OR server_creation_plan_source IS NULL)';

  EXECUTE '
    ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS server_creation_plan_start TIMESTAMPTZ';

  -- NULL = sınırsız (unlimited); dolu tarih = bitiş.
  EXECUTE '
    ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS server_creation_plan_end TIMESTAMPTZ';

  -- Indexler — admin listesi filtreleri için.
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_profiles_role                          ON profiles (role)';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_profiles_server_creation_plan_active   ON profiles (server_creation_plan) WHERE server_creation_plan IS NOT NULL AND server_creation_plan <> ''none''';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_profiles_server_creation_plan_end      ON profiles (server_creation_plan_end) WHERE server_creation_plan_end IS NOT NULL';
  EXECUTE 'CREATE INDEX IF NOT EXISTS idx_profiles_server_creation_plan_source   ON profiles (server_creation_plan_source) WHERE server_creation_plan_source IS NOT NULL';

  -- Backfill: mevcut plan'lara source=''manual'' ata (eski admin tarafından verilmiş varsay);
  -- sınırsız (plan_end=NULL). Paid kayıtları bu migration sonrası gerçek satın alma akışından gelecek.
  EXECUTE '
    UPDATE profiles
       SET server_creation_plan_source = COALESCE(server_creation_plan_source, ''manual''),
           server_creation_plan_start  = COALESCE(server_creation_plan_start, NOW())
     WHERE server_creation_plan IS NOT NULL
       AND server_creation_plan <> ''none''
       AND server_creation_plan_source IS NULL';
END$$;
