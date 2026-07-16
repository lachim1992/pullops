/**
 * PullOps changelog & app version tracker.
 *
 * Bump APP_VERSION and prepend a new entry to RELEASES whenever a
 * user-facing change is shipped. Client compares APP_VERSION against
 * localStorage("pullops:app-version-seen") on load and shows an in-app
 * "Nová verze" upozornění + zvoneček položku for each release the user
 * hasn't yet acknowledged.
 *
 * Version format: YYYY.MM.DD[.n] — lexically sortable, human-readable.
 */

export const APP_VERSION = "2026.07.16.1";

export type ReleaseCategory = "feature" | "fix" | "improvement";

export type ReleaseEntry = {
  version: string; // must be unique + lex-sortable (see APP_VERSION note)
  date: string; // ISO YYYY-MM-DD
  title: string;
  changes: Array<{ type: ReleaseCategory; text: string }>;
};

/**
 * Newest first. Do NOT reorder — the hook compares by array position
 * against the last-seen version to compute unseen releases.
 */
export const RELEASES: ReleaseEntry[] = [
  {
    version: "2026.07.16.1",
    date: "2026-07-16",
    title: "Přehled projektu má záložky a fixy",
    changes: [
      { type: "feature", text: "Přehled projektu má dvě záložky — Navigace a Dashboard s Můj přehled a statistikami projektu." },
      { type: "feature", text: "Notifikace o nové verzi aplikace s changelogem přímo ve zvonečku." },
      { type: "fix", text: "Horní lišta zůstává viditelná při scrollování." },
      { type: "fix", text: "Oprava pádu editoru při posunu plánu s endpointy v tahání na mobilu." },
      { type: "fix", text: "Mazání projektu už neselhává na audit záznamu." },
      { type: "improvement", text: "Popisky kabelů pod porty v Měření (kompletace)." },
    ],
  },
];

export function releasesSince(seenVersion: string | null): ReleaseEntry[] {
  if (!seenVersion) return [];
  const idx = RELEASES.findIndex((r) => r.version === seenVersion);
  // seen version not found (older than history) -> show all
  if (idx === -1) return RELEASES;
  return RELEASES.slice(0, idx);
}
