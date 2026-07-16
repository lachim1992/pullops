import { Rocket, Wrench, Sparkles, Bug } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RELEASES, APP_VERSION, type ReleaseCategory } from "@/lib/changelog";
import { cn } from "@/lib/utils";

const CATEGORY_STYLES: Record<
  ReleaseCategory,
  { label: string; icon: typeof Rocket; className: string }
> = {
  feature: {
    label: "Nové",
    icon: Sparkles,
    className:
      "border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 text-accent",
  },
  improvement: {
    label: "Vylepšení",
    icon: Wrench,
    className: "border-[color:var(--chart-2)]/40 bg-[color:var(--chart-2)]/10 text-[color:var(--chart-2)]",
  },
  fix: {
    label: "Oprava",
    icon: Bug,
    className: "border-amber-500/40 bg-amber-500/10 text-amber-500",
  },
};

export function ChangelogDialog({
  open,
  onOpenChange,
  onAcknowledge,
  seenVersion,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAcknowledge: () => void;
  seenVersion: string | null;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) onAcknowledge();
      }}
    >
      <DialogContent className="max-w-lg gap-0 p-0">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 text-accent">
              <Rocket className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="font-display text-base">Co je nového</DialogTitle>
              <DialogDescription className="font-mono text-[10px] uppercase tracking-[0.22em]">
                Aktuální verze {APP_VERSION}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] px-5 py-4">
          <ol className="space-y-5">
            {RELEASES.map((r) => {
              const isNew =
                seenVersion !== null && seenVersion !== APP_VERSION && r.version !== seenVersion
                  ? RELEASES.findIndex((x) => x.version === r.version) <
                    (RELEASES.findIndex((x) => x.version === seenVersion) === -1
                      ? RELEASES.length
                      : RELEASES.findIndex((x) => x.version === seenVersion))
                  : false;
              return (
                <li key={r.version} className="relative pl-4">
                  <div
                    className={cn(
                      "absolute left-0 top-1.5 h-2 w-2 rounded-full",
                      isNew ? "bg-accent shadow-[0_0_10px_var(--accent)]" : "bg-muted-foreground/40",
                    )}
                  />
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      v{r.version} · {r.date}
                    </span>
                    {isNew && (
                      <Badge
                        variant="outline"
                        className="border-[color:var(--accent)]/50 font-mono text-[9px] uppercase tracking-[0.18em] text-accent"
                      >
                        Nové
                      </Badge>
                    )}
                  </div>
                  <div className="mb-2 font-display text-sm font-semibold">{r.title}</div>
                  <ul className="space-y-1.5">
                    {r.changes.map((c, i) => {
                      const s = CATEGORY_STYLES[c.type];
                      const Icon = s.icon;
                      return (
                        <li key={i} className="flex items-start gap-2 text-xs">
                          <span
                            className={cn(
                              "mt-0.5 inline-flex h-4 shrink-0 items-center gap-1 rounded-sm border px-1 font-mono text-[9px] uppercase tracking-wider",
                              s.className,
                            )}
                          >
                            <Icon className="h-2.5 w-2.5" />
                            {s.label}
                          </span>
                          <span className="text-foreground/90">{c.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ol>
        </ScrollArea>

        <div className="flex justify-end border-t border-border/60 px-5 py-3">
          <Button
            size="sm"
            onClick={() => {
              onAcknowledge();
              onOpenChange(false);
            }}
          >
            Rozumím
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
