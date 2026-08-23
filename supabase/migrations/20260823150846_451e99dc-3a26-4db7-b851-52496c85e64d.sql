-- =========================================================
-- Plantech — Phase 0 foundation
-- =========================================================

-- ---------- Enums ----------
CREATE TYPE public.account_member_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE public.account_member_status AS ENUM ('invited', 'active', 'suspended');
CREATE TYPE public.care_log_type AS ENUM ('watering', 'fertilizing', 'pruning', 'repotting', 'treatment', 'note');
CREATE TYPE public.app_language AS ENUM ('pt', 'en', 'es');

-- ---------- Shared utility ----------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------- accounts ----------
CREATE TABLE public.accounts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 120),
  is_personal BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  billing_email TEXT,
  stripe_customer_id TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.accounts TO authenticated;
GRANT ALL ON public.accounts TO service_role;

-- ---------- profiles (1:1 with auth.users, no role column) ----------
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  preferred_language public.app_language NOT NULL DEFAULT 'pt',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- ---------- account_members (single source of truth for account authorization) ----------
CREATE TABLE public.account_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.account_member_role NOT NULL DEFAULT 'member',
  status public.account_member_status NOT NULL DEFAULT 'invited',
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, user_id)
);
CREATE INDEX idx_account_members_user ON public.account_members(user_id);
CREATE INDEX idx_account_members_account ON public.account_members(account_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_members TO authenticated;
GRANT ALL ON public.account_members TO service_role;

-- ---------- platform_admins (platform level only, never writable by users) ----------
CREATE TABLE public.platform_admins (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;

-- ---------- SECURITY DEFINER helpers (no recursive policy logic) ----------
CREATE OR REPLACE FUNCTION public.is_account_member(_account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.account_members
    WHERE account_id = _account_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_account_role(_account_id UUID, _role public.account_member_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.account_members
    WHERE account_id = _account_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins WHERE user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_account(_account_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_account_role(_account_id, 'owner')
      OR public.has_account_role(_account_id, 'admin');
$$;

-- ---------- Business tables ----------

CREATE TABLE public.plants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nickname TEXT NOT NULL CHECK (char_length(trim(nickname)) BETWEEN 1 AND 120),
  species_name TEXT,
  scientific_name TEXT,
  location TEXT,
  acquired_at DATE,
  notes TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, account_id)
);
CREATE INDEX idx_plants_account ON public.plants(account_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plants TO authenticated;
GRANT ALL ON public.plants TO service_role;

CREATE TABLE public.plant_photos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  plant_id UUID NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  taken_at TIMESTAMPTZ,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (plant_id, account_id) REFERENCES public.plants(id, account_id) ON DELETE CASCADE
);
CREATE INDEX idx_plant_photos_account ON public.plant_photos(account_id);
CREATE INDEX idx_plant_photos_plant ON public.plant_photos(plant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plant_photos TO authenticated;
GRANT ALL ON public.plant_photos TO service_role;

CREATE TABLE public.plant_care_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  plant_id UUID NOT NULL,
  care_type public.care_log_type NOT NULL,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (plant_id, account_id) REFERENCES public.plants(id, account_id) ON DELETE CASCADE
);
CREATE INDEX idx_plant_care_log_account ON public.plant_care_log(account_id);
CREATE INDEX idx_plant_care_log_plant_time ON public.plant_care_log(plant_id, performed_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plant_care_log TO authenticated;
GRANT ALL ON public.plant_care_log TO service_role;

CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 160),
  category TEXT,
  brand TEXT,
  quantity NUMERIC(12,3),
  unit TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_account ON public.products(account_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

CREATE TABLE public.ai_usage_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  feature TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'logorion',
  model TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  tokens_in INTEGER NOT NULL DEFAULT 0 CHECK (tokens_in >= 0),
  tokens_out INTEGER NOT NULL DEFAULT 0 CHECK (tokens_out >= 0),
  latency_ms INTEGER CHECK (latency_ms >= 0),
  cost_usd NUMERIC(12,6),
  summarized_payload JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(summarized_payload) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ai_usage_log_account_time ON public.ai_usage_log(account_id, created_at DESC);
GRANT SELECT ON public.ai_usage_log TO authenticated;
GRANT ALL ON public.ai_usage_log TO service_role;

CREATE OR REPLACE FUNCTION public.validate_ai_usage_payload()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF octet_length(NEW.summarized_payload::text) > 4096 THEN
    RAISE EXCEPTION 'summarized_payload must stay minimal structured JSON (max 4096 bytes)';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_ai_usage_payload
BEFORE INSERT OR UPDATE ON public.ai_usage_log
FOR EACH ROW EXECUTE FUNCTION public.validate_ai_usage_payload();

-- ---------- updated_at triggers ----------
CREATE TRIGGER trg_accounts_updated_at BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_account_members_updated_at BEFORE UPDATE ON public.account_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_plants_updated_at BEFORE UPDATE ON public.plants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- Row Level Security
-- =========================================================

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plant_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plant_care_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounts_select_members" ON public.accounts
  FOR SELECT TO authenticated
  USING (public.is_account_member(id) OR public.is_platform_admin(auth.uid()));
CREATE POLICY "accounts_insert_self" ON public.accounts
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "accounts_update_managers" ON public.accounts
  FOR UPDATE TO authenticated
  USING (public.can_manage_account(id))
  WITH CHECK (public.can_manage_account(id));
CREATE POLICY "accounts_delete_owner" ON public.accounts
  FOR DELETE TO authenticated
  USING (public.has_account_role(id, 'owner'));

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_platform_admin(auth.uid()));
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "account_members_select" ON public.account_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_account_member(account_id)
    OR public.is_platform_admin(auth.uid())
  );
CREATE POLICY "account_members_insert_managers" ON public.account_members
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_account(account_id));
CREATE POLICY "account_members_update_managers" ON public.account_members
  FOR UPDATE TO authenticated
  USING (public.can_manage_account(account_id))
  WITH CHECK (public.can_manage_account(account_id));
CREATE POLICY "account_members_delete_managers" ON public.account_members
  FOR DELETE TO authenticated
  USING (public.can_manage_account(account_id));

CREATE POLICY "platform_admins_select" ON public.platform_admins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));

CREATE POLICY "plants_select" ON public.plants
  FOR SELECT TO authenticated USING (public.is_account_member(account_id));
CREATE POLICY "plants_insert" ON public.plants
  FOR INSERT TO authenticated WITH CHECK (public.is_account_member(account_id));
CREATE POLICY "plants_update" ON public.plants
  FOR UPDATE TO authenticated
  USING (public.is_account_member(account_id))
  WITH CHECK (public.is_account_member(account_id));
CREATE POLICY "plants_delete" ON public.plants
  FOR DELETE TO authenticated USING (public.is_account_member(account_id));

CREATE POLICY "plant_photos_select" ON public.plant_photos
  FOR SELECT TO authenticated USING (public.is_account_member(account_id));
CREATE POLICY "plant_photos_insert" ON public.plant_photos
  FOR INSERT TO authenticated WITH CHECK (public.is_account_member(account_id));
CREATE POLICY "plant_photos_update" ON public.plant_photos
  FOR UPDATE TO authenticated
  USING (public.is_account_member(account_id))
  WITH CHECK (public.is_account_member(account_id));
CREATE POLICY "plant_photos_delete" ON public.plant_photos
  FOR DELETE TO authenticated USING (public.is_account_member(account_id));

CREATE POLICY "plant_care_log_select" ON public.plant_care_log
  FOR SELECT TO authenticated USING (public.is_account_member(account_id));
CREATE POLICY "plant_care_log_insert" ON public.plant_care_log
  FOR INSERT TO authenticated WITH CHECK (public.is_account_member(account_id));
CREATE POLICY "plant_care_log_update" ON public.plant_care_log
  FOR UPDATE TO authenticated
  USING (public.is_account_member(account_id))
  WITH CHECK (public.is_account_member(account_id));
CREATE POLICY "plant_care_log_delete" ON public.plant_care_log
  FOR DELETE TO authenticated USING (public.is_account_member(account_id));

CREATE POLICY "products_select" ON public.products
  FOR SELECT TO authenticated USING (public.is_account_member(account_id));
CREATE POLICY "products_insert" ON public.products
  FOR INSERT TO authenticated WITH CHECK (public.is_account_member(account_id));
CREATE POLICY "products_update" ON public.products
  FOR UPDATE TO authenticated
  USING (public.is_account_member(account_id))
  WITH CHECK (public.is_account_member(account_id));
CREATE POLICY "products_delete" ON public.products
  FOR DELETE TO authenticated USING (public.is_account_member(account_id));

CREATE POLICY "ai_usage_log_select" ON public.ai_usage_log
  FOR SELECT TO authenticated
  USING (public.is_account_member(account_id) OR public.is_platform_admin(auth.uid()));

-- =========================================================
-- Signup bootstrap
-- =========================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_display_name TEXT;
  v_language public.app_language := 'pt';
  v_raw_language TEXT;
  v_account_id UUID;
BEGIN
  v_display_name := NULLIF(trim(COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')), '');
  IF v_display_name IS NULL THEN
    v_display_name := split_part(COALESCE(NEW.email, 'user'), '@', 1);
  END IF;

  v_raw_language := lower(COALESCE(NEW.raw_user_meta_data ->> 'preferred_language', ''));
  IF v_raw_language IN ('pt', 'en', 'es') THEN
    v_language := v_raw_language::public.app_language;
  END IF;

  INSERT INTO public.profiles (id, full_name, preferred_language)
  VALUES (NEW.id, v_display_name, v_language)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.accounts (name, is_personal, created_by, billing_email)
  VALUES (left(v_display_name, 110) || ' account', true, NEW.id, NEW.email)
  RETURNING id INTO v_account_id;

  INSERT INTO public.account_members (account_id, user_id, role, status, joined_at)
  VALUES (v_account_id, NEW.id, 'owner', 'active', now())
  ON CONFLICT (account_id, user_id) DO NOTHING;

  IF lower(COALESCE(NEW.email, '')) = 'br61982407140@gmail.com' THEN
    INSERT INTO public.platform_admins (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- Storage policies for the private plant-photos bucket
-- Path pattern: <account_id>/<plant_id>/<file>
-- =========================================================

CREATE POLICY "plant_photos_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'plant-photos'
    AND public.is_account_member(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "plant_photos_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'plant-photos'
    AND public.is_account_member(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "plant_photos_storage_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'plant-photos'
    AND public.is_account_member(((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'plant-photos'
    AND public.is_account_member(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "plant_photos_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'plant-photos'
    AND public.is_account_member(((storage.foldername(name))[1])::uuid)
  );
