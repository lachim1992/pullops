import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { cs, en, type Dict, type Locale } from "./dictionaries";

const DICTS: Record<Locale, Dict> = { cs, en };
const STORAGE_KEY = "pullops.locale";

type Ctx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (path: string) => string;
};

const I18nContext = createContext<Ctx | null>(null);

function readInitialLocale(): Locale {
  if (typeof window === "undefined") return "cs";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === "cs" || v === "en") return v;
  } catch {
    /* noop */
  }
  return "cs";
}

function resolve(dict: Dict, path: string): string {
  const parts = path.split(".");
  let cur: unknown = dict;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return path;
    }
  }
  return typeof cur === "string" ? cur : path;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // Start with CS during SSR to avoid hydration mismatch; hydrate real locale in effect.
  const [locale, setLocaleState] = useState<Locale>("cs");

  useEffect(() => {
    const initial = readInitialLocale();
    if (initial !== "cs") setLocaleState(initial);
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* noop */
    }
  }, []);

  const t = useCallback((path: string) => resolve(DICTS[locale], path), [locale]);

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Fallback: passthrough resolver against CS so unwrapped trees don't crash.
    return {
      locale: "cs" as Locale,
      setLocale: () => {},
      t: (path: string) => resolve(cs, path),
    };
  }
  return ctx;
}
