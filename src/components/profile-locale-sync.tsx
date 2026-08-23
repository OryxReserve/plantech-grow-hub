import { useEffect, useRef } from "react";

import { useActiveAccount } from "@/context/active-account";
import { useI18n } from "@/i18n/i18n";
import { isLocale } from "@/i18n/translations";

/**
 * Applies the server-side `profiles.preferred_language` once per session.
 * When it is null/invalid, the localStorage locale keeps being used.
 */
export function ProfileLocaleSync() {
  const { profile } = useActiveAccount();
  const { setLocale } = useI18n();
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;
    const preferred = profile?.preferredLanguage;
    if (!isLocale(preferred)) return;
    applied.current = true;
    setLocale(preferred);
  }, [profile?.preferredLanguage, setLocale]);

  return null;
}
