-- ============================================================
-- Update policy — akıllı zorunlu güncelleme sistemi (PRODUCTION)
-- ============================================================

-- 1. TABLE
CREATE TABLE IF NOT EXISTS public.update_policy (
  id                    integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  latest_version        text NOT NULL DEFAULT '0.0.0',
  min_supported_version text NOT NULL DEFAULT '0.0.0',
  update_level          text NOT NULL DEFAULT 'optional'
    CHECK (update_level IN ('optional', 'recommended', 'force')),
  reason                text DEFAULT NULL,
  message               text DEFAULT NULL,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- 2. SINGLE ROW GUARANTEE (seed)
INSERT INTO public.update_policy (id, latest_version, min_supported_version, update_level)
VALUES (1, '0.0.0', '0.0.0', 'optional')
ON CONFLICT (id) DO NOTHING;

-- 3. UPDATED_AT AUTO UPDATE (trigger)
CREATE OR REPLACE FUNCTION public.set_update_policy_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_policy_updated_at ON public.update_policy;

CREATE TRIGGER trg_update_policy_updated_at
BEFORE UPDATE ON public.update_policy
FOR EACH ROW
EXECUTE FUNCTION public.set_update_policy_updated_at();

-- 4. RLS ENABLE
ALTER TABLE public.update_policy ENABLE ROW LEVEL SECURITY;

-- 5. READ POLICY (herkes okuyabilir)
DROP POLICY IF EXISTS update_policy_select ON public.update_policy;

CREATE POLICY update_policy_select
ON public.update_policy
FOR SELECT
USING (true);

-- 6. ADMIN UPDATE POLICY
DROP POLICY IF EXISTS update_policy_update ON public.update_policy;

CREATE POLICY update_policy_update
ON public.update_policy
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  )
);

-- 7. ADMIN INSERT POLICY (seed sonrası gerekirse)
DROP POLICY IF EXISTS update_policy_insert ON public.update_policy;

CREATE POLICY update_policy_insert
ON public.update_policy
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_admin = true
  )
);

-- 8. DELETE kapali (güvenlik)
REVOKE DELETE ON public.update_policy FROM PUBLIC;
