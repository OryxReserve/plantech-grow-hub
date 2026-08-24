ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS reminder_hour smallint NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS email_fallback_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.accounts
  ADD CONSTRAINT accounts_reminder_hour_check CHECK (reminder_hour >= 0 AND reminder_hour <= 23);

CREATE OR REPLACE FUNCTION public.validate_account_timezone()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.timezone IS NULL OR btrim(NEW.timezone) = '' THEN
    RAISE EXCEPTION 'timezone must be a non-empty IANA timezone name';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = NEW.timezone) THEN
    RAISE EXCEPTION 'invalid IANA timezone: %', NEW.timezone;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_accounts_validate_timezone ON public.accounts;
CREATE TRIGGER trg_accounts_validate_timezone
  BEFORE INSERT OR UPDATE OF timezone ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.validate_account_timezone();

CREATE TABLE public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fcm_token text NOT NULL UNIQUE,
  user_agent text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX push_subscriptions_account_id_idx ON public.push_subscriptions (account_id);
CREATE INDEX push_subscriptions_user_id_idx ON public.push_subscriptions (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_subscriptions_select ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (is_account_member(account_id));

CREATE POLICY push_subscriptions_insert ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (is_account_member(account_id) AND user_id = auth.uid());

CREATE POLICY push_subscriptions_update ON public.push_subscriptions
  FOR UPDATE TO authenticated
  USING (is_account_member(account_id) AND user_id = auth.uid())
  WITH CHECK (is_account_member(account_id) AND user_id = auth.uid());

CREATE POLICY push_subscriptions_delete ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (is_account_member(account_id) AND user_id = auth.uid());