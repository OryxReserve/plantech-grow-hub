-- Signup bootstrap runs only as a trigger; nobody should be able to call it.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Trigger-only helpers
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_ai_usage_payload() FROM PUBLIC, anon, authenticated;

-- Authorization helpers: required by RLS policies for signed-in users only.
REVOKE ALL ON FUNCTION public.is_account_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_account_role(uuid, public.account_member_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_account(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_account_member(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_account_role(uuid, public.account_member_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_account(uuid) TO authenticated, service_role;
