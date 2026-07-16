import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { APP_VERSION, RELEASES, releasesSince, type ReleaseEntry } from "@/lib/changelog";

const STORAGE_KEY = "pullops:app-version-seen";

/**
 * Detects when the running APP_VERSION differs from what the user last
 * acknowledged. First visit (no stored value) is silently marked as seen
 * so we don't spam existing users with the full historical changelog.
 */
export function useAppUpdate() {
  const [seenVersion, setSeenVersion] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      // First visit — mark current as seen quietly.
      window.localStorage.setItem(STORAGE_KEY, APP_VERSION);
      setSeenVersion(APP_VERSION);
      setHydrated(true);
      return;
    }
    setSeenVersion(stored);
    setHydrated(true);

    if (stored !== APP_VERSION) {
      const latest = RELEASES[0];
      if (latest) {
        toast(`Nová verze aplikace ${latest.version}`, {
          description: latest.title,
          duration: 8000,
          action: {
            label: "Co je nového",
            onClick: () => setDialogOpen(true),
          },
        });
      }
    }
  }, []);

  const hasUpdate = hydrated && seenVersion !== null && seenVersion !== APP_VERSION;
  const unseenReleases: ReleaseEntry[] = hasUpdate ? releasesSince(seenVersion) : [];

  const acknowledge = useCallback(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, APP_VERSION);
    setSeenVersion(APP_VERSION);
  }, []);

  const openChangelog = useCallback(() => setDialogOpen(true), []);
  const closeChangelog = useCallback(() => setDialogOpen(false), []);

  return {
    hasUpdate,
    currentVersion: APP_VERSION,
    seenVersion,
    unseenReleases,
    dialogOpen,
    openChangelog,
    closeChangelog,
    setDialogOpen,
    acknowledge,
  };
}
