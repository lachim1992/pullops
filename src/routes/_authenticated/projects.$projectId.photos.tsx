import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Camera,
  MessageSquare,
  MapPin,
  AlertTriangle,
  FileText,
  Cable,
  Loader2,
  ExternalLink,
  Search,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  listAllProjectPhotos,
  type ArchivePhoto,
  type PhotoSource,
} from "@/lib/projectPhotos.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/projects/$projectId/photos")({
  head: () => ({
    meta: [{ title: "Fotodokumentace · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: PhotosArchivePage,
});

const FILTERS: Array<{ key: PhotoSource | "all"; label: string; icon: typeof Camera }> = [
  { key: "all", label: "Vše", icon: Camera },
  { key: "lobby", label: "Lobby", icon: MessageSquare },
  { key: "endpoint", label: "Endpointy", icon: MapPin },
  { key: "defect", label: "Závady", icon: AlertTriangle },
  { key: "protocol", label: "Protokoly", icon: FileText },
  { key: "day_plan", label: "Tahání", icon: Cable },
];

const SOURCE_META: Record<PhotoSource, { label: string; className: string; icon: typeof Camera }> = {
  lobby: {
    label: "Lobby",
    className: "border-sky-500/40 bg-sky-500/10 text-sky-400",
    icon: MessageSquare,
  },
  endpoint: {
    label: "Endpoint",
    className: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    icon: MapPin,
  },
  defect: {
    label: "Závada",
    className: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    icon: AlertTriangle,
  },
  protocol: {
    label: "Protokol",
    className: "border-violet-500/40 bg-violet-500/10 text-violet-400",
    icon: FileText,
  },
  day_plan: {
    label: "Tahání",
    className: "border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10 text-accent",
    icon: Cable,
  },
};

function PhotosArchivePage() {
  const { projectId } = Route.useParams();
  const fetchAll = useServerFn(listAllProjectPhotos);
  const [filter, setFilter] = useState<PhotoSource | "all">("all");
  const [q, setQ] = useState("");

  const query = useQuery({
    queryKey: ["project-photos-archive", projectId],
    queryFn: () => fetchAll({ data: { projectId } }),
  });

  const photos = query.data?.photos ?? [];
  const warnings = query.data?.warnings ?? [];

  const filtered = useMemo(() => {
    return photos.filter((p) => {
      if (filter !== "all" && p.source !== filter) return false;
      if (q.trim()) {
        const t = q.toLowerCase();
        const hay = `${p.caption ?? ""} ${p.linkLabel} ${p.uploaderName ?? ""}`.toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });
  }, [photos, filter, q]);

  const counts = useMemo(() => {
    const c: Record<PhotoSource | "all", number> = {
      all: 0,
      lobby: 0,
      endpoint: 0,
      defect: 0,
      protocol: 0,
      day_plan: 0,
    };
    for (const p of photos) {
      c.all++;
      c[p.source]++;
    }
    return c;
  }, [photos]);


  return (
    <AppShell projectId={projectId}>
      <div className="animate-fade-in space-y-5">
        <header>
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
            Projekt / Lobby / Fotodokumentace
          </div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight">
            Fotodokumentace
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Kompletní archiv všech fotek napříč projektem — lobby, endpointy, závady, protokoly a
            day plány.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] transition-colors",
                filter === f.key
                  ? "border-[color:var(--accent)]/60 bg-[color:var(--accent)]/15 text-accent"
                  : "border-border/60 bg-card/40 text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              <f.icon className="h-3.5 w-3.5" />
              {f.label}
              <span className="ml-1 rounded-sm bg-muted/60 px-1 text-[10px] text-foreground/80">
                {counts[f.key]}
              </span>
            </button>
          ))}
          <div className="relative ml-auto w-full max-w-xs">
            <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Hledat v popiscích…"
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>

        {warnings.length > 0 && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-300">
            Některé zdroje nešlo načíst: {warnings.join(" · ")}
          </div>
        )}

        {query.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Načítám archiv…
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-card/30 p-12 text-center text-sm text-muted-foreground">
            {photos.length === 0
              ? "Zatím žádné fotky v projektu."
              : "Nic neodpovídá filtru."}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filtered.map((p) => (
              <PhotoCard key={p.id} p={p} />
            ))}
          </div>
        )}

      </div>
    </AppShell>
  );
}

function PhotoCard({ p }: { p: ArchivePhoto }) {
  const meta = SOURCE_META[p.source];
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/60 bg-card/40 backdrop-blur transition-all hover:border-[color:var(--accent)]/40 hover:shadow-[0_20px_50px_-30px_var(--accent)]">
      <div className="relative aspect-square w-full overflow-hidden bg-muted/30">
        {p.url ? (
          <a href={p.url} target="_blank" rel="noopener noreferrer">
            <img
              src={p.url}
              alt={p.caption ?? p.linkLabel}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </a>
        ) : (
          <div className="grid h-full place-items-center text-xs text-muted-foreground">
            <Camera className="h-6 w-6" />
          </div>
        )}
        <Badge
          variant="outline"
          className={cn(
            "absolute left-1.5 top-1.5 gap-1 border font-mono text-[9px] uppercase tracking-[0.14em]",
            meta.className,
          )}
        >
          <meta.icon className="h-3 w-3" />
          {meta.label}
        </Badge>
      </div>
      <div className="p-2.5">
        {p.caption && (
          <div className="line-clamp-2 text-xs text-foreground/90">{p.caption}</div>
        )}
        <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
          {new Date(p.createdAt).toLocaleString("cs-CZ", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {p.uploaderName ? ` · ${p.uploaderName}` : ""}
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-1">
          <Button asChild size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]">
            <a href={p.linkTo}>
              <ExternalLink className="mr-1 h-3 w-3" />
              {p.linkLabel}
            </a>
          </Button>
        </div>

      </div>
    </div>
  );
}
