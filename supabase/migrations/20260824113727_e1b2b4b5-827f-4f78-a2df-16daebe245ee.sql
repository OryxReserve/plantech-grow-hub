CREATE TABLE public.care_reminder_sent (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  task_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, local_date)
);

GRANT SELECT ON public.care_reminder_sent TO authenticated;
GRANT ALL ON public.care_reminder_sent TO service_role;

ALTER TABLE public.care_reminder_sent ENABLE ROW LEVEL SECURITY;

CREATE POLICY "care_reminder_sent_select" ON public.care_reminder_sent
  FOR SELECT TO authenticated
  USING (public.is_account_member(account_id));

CREATE TABLE public.reminder_run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  accounts_considered integer NOT NULL DEFAULT 0,
  accounts_notified integer NOT NULL DEFAULT 0,
  push_sent integer NOT NULL DEFAULT 0,
  push_failed integer NOT NULL DEFAULT 0,
  stale_tokens_removed integer NOT NULL DEFAULT 0,
  triggered_manually boolean NOT NULL DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.reminder_run_log TO service_role;

ALTER TABLE public.reminder_run_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reminder_run_log_select_admins" ON public.reminder_run_log
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.list_accounts_due_for_reminder()
RETURNS TABLE (account_id uuid, timezone text, local_date date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.timezone,
    (now() AT TIME ZONE a.timezone)::date
  FROM public.accounts a
  WHERE EXTRACT(HOUR FROM (now() AT TIME ZONE a.timezone))::int = a.reminder_hour
    AND NOT EXISTS (
      SELECT 1 FROM public.care_reminder_sent s
      WHERE s.account_id = a.id
        AND s.local_date = (now() AT TIME ZONE a.timezone)::date
    );
$$;

REVOKE ALL ON FUNCTION public.list_accounts_due_for_reminder() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_accounts_due_for_reminder() TO service_role;