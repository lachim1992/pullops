import { Languages } from "lucide-react";

import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

export function LanguageToggle({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { locale, setLocale } = useT();

  return (
    <div
      className={cn(
        "inline-flex items-center gap-0 overflow-hidden rounded-full border border-border/60 bg-card/40 p-0.5 backdrop-blur",
        className,
      )}
      role="group"
      aria-label="Language"
    >
      {!compact && <Languages className="ml-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
      <button
        type="button"
        onClick={() => setLocale("cs")}
        className={cn(
          "rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors",
          locale === "cs"
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={locale === "cs"}
      >
        CS
      </button>
      <button
        type="button"
        onClick={() => setLocale("en")}
        className={cn(
          "rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest transition-colors",
          locale === "en"
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={locale === "en"}
      >
        EN
      </button>
    </div>
  );
}
