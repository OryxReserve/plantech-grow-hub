import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AccountRole = Database["public"]["Enums"]["account_member_role"];

export type AccountMembership = {
  accountId: string;
  accountName: string;
  isPersonal: boolean;
  role: AccountRole;
};

export type Profile = {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  preferredLanguage: Database["public"]["Enums"]["app_language"];
};

type SessionUser = { id: string; email: string | null };

type ActiveAccountValue = {
  user: SessionUser | null;
  profile: Profile | null;
  memberships: AccountMembership[];
  activeAccountId: string | null;
  activeMembership: AccountMembership | null;
  setActiveAccountId: (accountId: string) => void;
  isLoading: boolean;
  error: Error | null;
  refetch: UseQueryResult["refetch"];
};

const STORAGE_KEY = "plantech.activeAccountId";

const ActiveAccountContext = createContext<ActiveAccountValue | null>(null);

async function loadAccountContext() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const user = userData.user;
  if (!user) return { user: null, profile: null, memberships: [] as AccountMembership[] };

  const [profileResult, membershipResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, avatar_url, preferred_language")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("account_members")
      .select("role, account_id, accounts(id, name, is_personal)")
      .eq("user_id", user.id)
      .eq("status", "active"),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (membershipResult.error) throw membershipResult.error;

  const memberships: AccountMembership[] = (membershipResult.data ?? [])
    .filter((row) => row.accounts)
    .map((row) => ({
      accountId: row.account_id,
      accountName: row.accounts!.name,
      isPersonal: row.accounts!.is_personal,
      role: row.role,
    }))
    .sort((a, b) => a.accountName.localeCompare(b.accountName));

  return {
    user: { id: user.id, email: user.email ?? null } satisfies SessionUser,
    profile: profileResult.data
      ? {
          id: profileResult.data.id,
          fullName: profileResult.data.full_name,
          avatarUrl: profileResult.data.avatar_url,
          preferredLanguage: profileResult.data.preferred_language,
        }
      : null,
    memberships,
  };
}

export function ActiveAccountProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ["account-context"],
    queryFn: loadAccountContext,
    staleTime: 60_000,
  });

  const memberships = useMemo(() => query.data?.memberships ?? [], [query.data]);
  const [storedAccountId, setStoredAccountId] = useState<string | null>(null);

  useEffect(() => {
    setStoredAccountId(window.localStorage.getItem(STORAGE_KEY));
  }, []);

  // Multi-account ready: the stored account wins when it is still a valid
  // membership, otherwise fall back to the first active membership.
  const activeAccountId = useMemo(() => {
    if (memberships.length === 0) return null;
    const stored = memberships.find((m) => m.accountId === storedAccountId);
    return stored ? stored.accountId : memberships[0]!.accountId;
  }, [memberships, storedAccountId]);

  const setActiveAccountId = useCallback((accountId: string) => {
    window.localStorage.setItem(STORAGE_KEY, accountId);
    setStoredAccountId(accountId);
  }, []);

  const value = useMemo<ActiveAccountValue>(
    () => ({
      user: query.data?.user ?? null,
      profile: query.data?.profile ?? null,
      memberships,
      activeAccountId,
      activeMembership:
        memberships.find((m) => m.accountId === activeAccountId) ?? null,
      setActiveAccountId,
      isLoading: query.isPending,
      error: (query.error as Error) ?? null,
      refetch: query.refetch,
    }),
    [query, memberships, activeAccountId, setActiveAccountId],
  );

  return (
    <ActiveAccountContext.Provider value={value}>
      {children}
    </ActiveAccountContext.Provider>
  );
}

export function useActiveAccount() {
  const ctx = useContext(ActiveAccountContext);
  if (!ctx)
    throw new Error("useActiveAccount must be used inside ActiveAccountProvider");
  return ctx;
}

/** Active account id for data access; throws when called outside a valid context. */
export function useRequiredAccountId() {
  const { activeAccountId } = useActiveAccount();
  if (!activeAccountId) throw new Error("No active account in context");
  return activeAccountId;
}
