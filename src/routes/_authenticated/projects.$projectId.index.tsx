import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Cable,
  Camera,
  CheckCircle2,
  CheckSquare,
  ClipboardList,
  Circle,
  FileText,
  FolderKanban,
  Loader2,
  MessageSquare,
  PlayCircle,
  Route as RouteIcon,
  Users,
  Wrench,
  Zap,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { getProject } from "@/lib/projects.functions";
import { getMyProjectCapabilities } from "@/lib/capabilities.functions";
import {
  getProjectProgress,
  getProjectHome,
  getMyProjectDashboard,
} from "@/lib/metrics.functions";
import { useT } from "@/i18n";


export const Route = createFileRoute("/_authenticated/projects/$projectId/")({
  head: () => ({
    meta: [{ title: "Project · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { projectId } = useParams({ from: "/_authenticated/projects/$projectId/" });
  const { t } = useT();
  const fetchProject = useServerFn(getProject);
  const fetchCaps = useServerFn(getMyProjectCapabilities);
  const fetchProgress = useServerFn(getProjectProgress);
  const fetchHome = useServerFn(getProjectHome);
  const fetchMyDash = useServerFn(getMyProjectDashboard);

  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => fetchProject({ data: { id: projectId } }),
  });
  const caps = useQuery({
    queryKey: ["me", "project-caps", projectId],
    queryFn: () => fetchCaps({ data: { projectId } }),
  });
  const progress = useQuery({
    queryKey: ["project-progress", projectId],
    queryFn: () => fetchProgress({ data: { projectId } }),
  });
  const home = useQuery({
    queryKey: ["project-home", projectId],
    queryFn: () => fetchHome({ data: { projectId } }),
  });
  const myDash = useQuery({
    queryKey: ["project-my-dashboard", projectId],
    queryFn: () => fetchMyDash({ data: { projectId } }),
    refetchInterval: 60_000,
  });

  const canManage = caps.data?.canManage ?? false;

  return (
    <AppShell projectId={projectId}>
      {project.isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("projectHub.loading")}
        </div>
      ) : !project.data ? (
        <div className="text-muted-foreground">{t("projectHub.notFound")}</div>
      ) : (
        <>
          {/* Compact header */}
          <motion.header
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="mb-5"
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-accent">
              {project.data.code}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
                {project.data.name}
              </h1>
              <Badge variant="secondary" className="font-mono text-[10px]">
                {project.data.status}
              </Badge>
              {project.data.is_demo && (
                <Badge
                  variant="outline"
                  className="border-[color:var(--accent)]/50 font-mono text-[10px] text-accent"
                >
                  DEMO
                </Badge>
              )}
            </div>
            {(project.data.address || project.data.customer) && (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {[project.data.customer, project.data.address].filter(Boolean).join(" · ")}
              </p>
            )}
          </motion.header>

          {/* Personal dashboard — my tasks + today's activity */}
          <section className="mb-5">
            <PersonalDashboard data={myDash.data} loading={myDash.isLoading} projectId={projectId} />
          </section>



          {/* Primary hub — bento 2x3 on mobile, 5 across on desktop */}
          <section className="mb-5">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
              <HubTile
                projectId={projectId}
                to="/projects/$projectId/lobby"
                icon={MessageSquare}
                title={t("nav.chat") ?? "Chat"}
                tone="chat"
                metric={home.data ? `${home.data.hub.chatRecent}` : "—"}
                metricLabel="24h zpráv"
              />
              <HubTile
                projectId={projectId}
                to="/projects/$projectId/work"
                icon={Cable}
                title="Tahání"
                tone="pull"
                metric={home.data ? `${home.data.hub.pulledPct}%` : "—"}
                metricLabel="nataženo"
              />
              <HubTile
                projectId={projectId}
                to="/projects/$projectId/completion"
                icon={CheckSquare}
                title="Kompletace"
                tone="completion"
                metric={
                  home.data
                    ? `${home.data.hub.completionDone}/${home.data.hub.completionTotal || 0}`
                    : "—"
                }
                metricLabel="endpointů hotovo"
              />
              <HubTile
                projectId={projectId}
                to="/projects/$projectId/defects"
                icon={AlertTriangle}
                title="Závady"
                tone="defects"
                metric={home.data ? `${home.data.hub.defectsOpen}` : "—"}
                metricLabel="otevřených"
                highlight={home.data ? home.data.hub.defectsOpen > 0 : false}
              />
              <HubTile
                projectId={projectId}
                to="/projects/$projectId/protocols"
                icon={FileText}
                title="Protokoly"
                tone="protocols"
                metric={home.data ? `${home.data.hub.protocolsTotal}` : "—"}
                metricLabel="celkem"
              />
              {/* 6th tile on mobile row */}
              {canManage ? (
                <HubTile
                  projectId={projectId}
                  to="/projects/$projectId/documents"
                  icon={FolderKanban}
                  title={t("nav.manage") ?? "Správa"}
                  tone="manage"
                  metric="→"
                  metricLabel="nastavení"
                />
              ) : (
                <HubTile
                  projectId={projectId}
                  to="/projects/$projectId/photos"
                  icon={Camera}
                  title="Fotoarchiv"
                  tone="chat"
                  metric={home.data ? `${home.data.hub.photosTotal}` : "—"}
                  metricLabel="fotek celkem"
                />
              )}

            </div>
          </section>

          {/* Compact progress card with 4 mini bars */}
          <section className="mb-5">
            <CompactProgress progress={progress.data} loading={progress.isLoading} />
          </section>

          {/* Alerts + today's plans */}
          <section className="mb-5 grid gap-2.5 md:grid-cols-2">
            <AlertsCard defectsOpen={home.data?.hub.defectsOpen ?? 0} projectId={projectId} />
            <TodaysPlansCard plans={home.data?.todaysPlans ?? []} projectId={projectId} />
          </section>

          {/* Recent activity */}
          <section className="mb-8">
            <div className="mb-2.5 flex items-center gap-3">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                Poslední aktivita
              </h2>
              <div className="hairline-gold h-px flex-1" />
              <Link
                to="/projects/$projectId/lobby"
                params={{ projectId }}
                className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent hover:underline"
              >
                Vše →
              </Link>
            </div>
            <RecentActivity items={home.data?.recentActivity ?? []} loading={home.isLoading} />
          </section>

          {canManage && (
            <section className="mb-8">
              <div className="mb-2.5 flex items-center gap-3">
                <h2 className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                  {t("nav.manage")}
                </h2>
                <div className="hairline-gold h-px flex-1" />
              </div>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                <SectionLink projectId={projectId} to="/projects/$projectId/documents" icon={ClipboardList} title={t("projectHub.docsTitle")} />
                <SectionLink projectId={projectId} to="/projects/$projectId/plans" icon={RouteIcon} title={t("projectHub.plansTitle")} />
                <SectionLink projectId={projectId} to="/projects/$projectId/endpoints" icon={Wrench} title={t("projectHub.endpointsTitle")} />
                <SectionLink projectId={projectId} to="/projects/$projectId/cable-types" icon={Cable} title={t("projectHub.ctypesTitle")} />
                <SectionLink projectId={projectId} to="/projects/$projectId/cables" icon={Cable} title={t("projectHub.cablesTitle")} />
                <SectionLink projectId={projectId} to="/projects/$projectId/spools" icon={Cable} title={t("projectHub.spoolsTitle")} />
                <SectionLink projectId={projectId} to="/projects/$projectId/members" icon={Users} title={t("projectHub.membersTitle")} />
              </div>
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}

/* ---------------- Hub tile ---------------- */

type HubTone = "chat" | "pull" | "completion" | "defects" | "protocols" | "manage";

const TONE_STYLES: Record<HubTone, { grad: string; border: string; icon: string }> = {
  chat: {
    grad: "from-[color:var(--chart-2)]/25 to-transparent",
    border: "border-[color:var(--chart-2)]/40",
    icon: "text-[color:var(--chart-2)] bg-[color:var(--chart-2)]/10 border-[color:var(--chart-2)]/30",
  },
  pull: {
    grad: "from-[color:var(--accent)]/25 to-transparent",
    border: "border-[color:var(--accent)]/40",
    icon: "text-accent bg-[color:var(--accent)]/10 border-[color:var(--accent)]/30",
  },
  completion: {
    grad: "from-[color:var(--chart-5)]/25 to-transparent",
    border: "border-[color:var(--chart-5)]/40",
    icon: "text-[color:var(--chart-5)] bg-[color:var(--chart-5)]/10 border-[color:var(--chart-5)]/30",
  },
  defects: {
    grad: "from-amber-500/25 to-transparent",
    border: "border-amber-500/40",
    icon: "text-amber-500 bg-amber-500/10 border-amber-500/30",
  },
  protocols: {
    grad: "from-[color:var(--chart-4)]/25 to-transparent",
    border: "border-[color:var(--chart-4)]/40",
    icon: "text-[color:var(--chart-4)] bg-[color:var(--chart-4)]/10 border-[color:var(--chart-4)]/30",
  },
  manage: {
    grad: "from-[color:var(--gold-soft)]/20 to-transparent",
    border: "border-[color:var(--accent)]/30",
    icon: "text-accent bg-[color:var(--accent)]/10 border-[color:var(--accent)]/25",
  },
};

function HubTile({
  projectId,
  to,
  icon: Icon,
  title,
  tone,
  metric,
  metricLabel,
  highlight = false,
}: {
  projectId: string;
  to: string;
  icon: typeof Cable;
  title: string;
  tone: HubTone;
  metric: string;
  metricLabel: string;
  highlight?: boolean;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.15 }}>
      <Link
        to={to as never}
        params={{ projectId } as never}
        className={`group relative flex h-full flex-col overflow-hidden rounded-xl border ${styles.border} bg-card/70 p-3 backdrop-blur transition-colors hover:bg-card sm:p-4`}
      >
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${styles.grad} opacity-70`} />
        {highlight && (
          <div className="absolute right-2 top-2 h-2 w-2 animate-pulse rounded-full bg-amber-500 shadow-[0_0_10px_var(--accent)]" />
        )}
        <div className={`relative flex h-9 w-9 items-center justify-center rounded-lg border ${styles.icon}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="relative mt-2 min-w-0 font-display text-[13px] font-semibold uppercase leading-tight tracking-tight sm:text-sm">
          {title}
        </div>
        <div className="relative mt-1.5 flex items-baseline gap-1">
          <div className="font-mono text-lg font-bold leading-none tabular-nums sm:text-xl">
            {metric}
          </div>
        </div>
        <div className="relative mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
          {metricLabel}
        </div>
      </Link>
    </motion.div>
  );
}

/* ---------------- Compact progress ---------------- */

function CompactProgress({
  progress,
  loading,
}: {
  progress: import("@/lib/metrics.functions").ProjectProgress | undefined;
  loading: boolean;
}) {
  if (loading || !progress) {
    return (
      <div className="rounded-xl border border-border/60 bg-card/40 p-4 text-xs text-muted-foreground">
        <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" />
        Načítám postup…
      </div>
    );
  }
  const donePct =
    progress.cables.total > 0
      ? Math.round((progress.cables.done / progress.cables.total) * 100)
      : 0;

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4 backdrop-blur">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.24em] text-muted-foreground">
            Celkový progres
          </div>
          <div className="mt-0.5 font-display text-3xl font-semibold tracking-tight text-accent">
            {progress.progressPct}%
          </div>
        </div>
        <div className="text-right font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {progress.cables.total} kabelů
          <br />
          {progress.endpoints.total} endpointů
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[color:var(--accent)] to-[color:var(--gold-soft,var(--accent))]"
          style={{ width: `${progress.progressPct}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <MiniBar label="Nataženo" done={progress.cables.pulled} total={progress.cables.total} pct={progress.pulledPct} color="var(--chart-2)" />
        <MiniBar label="Proměřeno" done={progress.cables.terminated} total={progress.cables.total} pct={progress.terminatedPct} color="var(--accent)" />
        <MiniBar label="Změřeno" done={progress.cables.tested} total={progress.cables.total} pct={progress.testedPct} color="var(--chart-5)" />
        <MiniBar label="Hotovo" done={progress.cables.done} total={progress.cables.total} pct={donePct} color="var(--chart-4)" />
      </div>
    </div>
  );
}

function MiniBar({
  label,
  done,
  total,
  pct,
  color,
}: {
  label: string;
  done: number;
  total: number;
  pct: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-20 shrink-0 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: `color-mix(in oklab, ${color} 100%, transparent)` }}
        />
      </div>
      <div className="w-14 shrink-0 text-right font-mono text-[10px] tabular-nums">
        <span className="font-bold">{pct}%</span>
        <span className="ml-1 text-muted-foreground">
          {done}/{total}
        </span>
      </div>
    </div>
  );
}

/* ---------------- Alerts + today's plans ---------------- */

function AlertsCard({ defectsOpen, projectId }: { defectsOpen: number; projectId: string }) {
  const hasAlert = defectsOpen > 0;
  return (
    <Link
      to="/projects/$projectId/defects"
      params={{ projectId }}
      className={`flex items-center gap-3 rounded-xl border p-3.5 transition-colors ${
        hasAlert
          ? "border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/15"
          : "border-border/60 bg-card/50 hover:bg-card/70"
      }`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${
          hasAlert
            ? "border-amber-500/40 bg-amber-500/15 text-amber-500"
            : "border-border/60 bg-muted/50 text-muted-foreground"
        }`}
      >
        <AlertTriangle className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Alerty
        </div>
        <div className={`mt-0.5 font-display text-base font-semibold ${hasAlert ? "text-amber-500" : ""}`}>
          {hasAlert ? `${defectsOpen} otevřených závad` : "Bez blokátorů"}
        </div>
      </div>
    </Link>
  );
}

function TodaysPlansCard({
  plans,
  projectId,
}: {
  plans: Array<{ id: string; name: string; totalCables: number }>;
  projectId: string;
}) {
  const has = plans.length > 0;
  return (
    <Link
      to="/projects/$projectId/work"
      params={{ projectId }}
      className="flex items-start gap-3 rounded-xl border border-border/60 bg-card/50 p-3.5 transition-colors hover:bg-card/70"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 text-accent">
        <Cable className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Dnešní úkoly
        </div>
        {has ? (
          <div className="mt-0.5 space-y-0.5">
            {plans.slice(0, 2).map((p) => (
              <div key={p.id} className="truncate font-display text-sm font-semibold">
                {p.name}
                <span className="ml-1.5 font-mono text-[10px] font-normal text-muted-foreground">
                  · {p.totalCables} kabelů
                </span>
              </div>
            ))}
            {plans.length > 2 && (
              <div className="font-mono text-[10px] text-muted-foreground">
                +{plans.length - 2} další
              </div>
            )}
          </div>
        ) : (
          <div className="mt-0.5 font-display text-sm text-muted-foreground">
            Žádný day plán na dnes
          </div>
        )}
      </div>
    </Link>
  );
}

/* ---------------- Recent activity ---------------- */

function RecentActivity({
  items,
  loading,
}: {
  items: Array<{ id: string; createdAt: string; author: string; excerpt: string }>;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border/60 bg-card/40 p-3 text-xs text-muted-foreground">
        <Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" />
        Načítám…
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 bg-card/30 p-4 text-center text-xs text-muted-foreground">
        Zatím žádná aktivita. Napiš tým do chatu ↑
      </div>
    );
  }
  return (
    <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60 bg-card/50">
      {items.map((it) => (
        <div key={it.id} className="flex items-start gap-2.5 p-2.5">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-[10px] font-bold uppercase">
            {(it.author || "?").slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <div className="truncate font-mono text-[11px] font-semibold uppercase tracking-wider">
                {it.author}
              </div>
              <div className="shrink-0 font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                {relTime(it.createdAt)}
              </div>
            </div>
            <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{it.excerpt}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function relTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.max(1, Math.round((now - then) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}

/* ---------------- Section link ---------------- */

function SectionLink({
  projectId,
  to,
  icon: Icon,
  title,
}: {
  projectId: string;
  to: string;
  icon: typeof Cable;
  title: string;
}) {
  return (
    <Link
      to={to as never}
      params={{ projectId } as never}
      className="group flex items-center gap-2.5 rounded-lg border border-border/60 bg-card/50 p-2.5 backdrop-blur transition-colors hover:border-[color:var(--accent)]/50 hover:bg-card/80"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 text-accent">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 truncate font-display text-sm font-semibold">{title}</div>
    </Link>
  );
}

/* ---------------- Personal dashboard ---------------- */

function PersonalDashboard({
  data,
  loading,
  projectId,
}: {
  data: import("@/lib/metrics.functions").MyProjectDashboard | undefined;
  loading: boolean;
  projectId: string;
}) {
  const tasks = data?.tasks ?? {
    today: { todo: 0, inProgress: 0, done: 0 },
    total: { todo: 0, inProgress: 0, done: 0 },
  };
  const act = data?.activity ?? {
    pull: { pulled: 0, terminated: 0, tested: 0, done: 0 },
    completion: { endpoints: 0, panels: 0 },
  };
  const pullTotal = act.pull.pulled + act.pull.terminated + act.pull.tested + act.pull.done;
  const compTotal = act.completion.endpoints + act.completion.panels;

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-3 backdrop-blur sm:p-4">
      <div className="mb-2 flex items-center gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          Můj přehled
        </div>
        <div className="hairline-gold h-px flex-1" />
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>

      {/* Row 1: today's tasks | Row 2: total tasks */}
      <div className="grid gap-2 sm:grid-cols-2">
        <TaskRow
          label="Dnes"
          data={tasks.today}
          projectId={projectId}
          tone="accent"
        />
        <TaskRow
          label="Celý projekt"
          data={tasks.total}
          projectId={projectId}
          tone="muted"
        />
      </div>

      {/* Row 3: today's activity across pull + completion */}
      <div className="mt-2 flex items-stretch gap-2 overflow-x-auto rounded-lg border border-border/50 bg-background/40 p-2">
        <div className="flex shrink-0 items-center gap-2 pr-2">
          <Zap className="h-3.5 w-3.5 text-accent" />
          <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
            Dnešní aktivita
          </div>
        </div>
        <ActPill icon={Cable} label="Nataženo" value={act.pull.pulled} />
        <ActPill icon={Cable} label="Proměřeno" value={act.pull.terminated} />
        <ActPill icon={Cable} label="Změřeno" value={act.pull.tested} />
        <ActPill icon={CheckSquare} label="Endpoint" value={act.completion.endpoints} />
        <ActPill icon={CheckSquare} label="Panel" value={act.completion.panels} />
        <div className="ml-auto shrink-0 self-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          <span className="text-accent">{pullTotal}</span> tahání ·{" "}
          <span className="text-[color:var(--chart-5)]">{compTotal}</span> kompletace
        </div>
      </div>
    </div>
  );
}

function TaskRow({
  label,
  data,
  projectId,
  tone,
}: {
  label: string;
  data: { todo: number; inProgress: number; done: number };
  projectId: string;
  tone: "accent" | "muted";
}) {
  return (
    <Link
      to="/projects/$projectId/lobby"
      params={{ projectId }}
      className={`flex items-center gap-2 rounded-lg border p-2 transition-colors hover:bg-card ${
        tone === "accent"
          ? "border-[color:var(--accent)]/40 bg-[color:var(--accent)]/5"
          : "border-border/50 bg-background/40"
      }`}
    >
      <div
        className={`shrink-0 font-mono text-[9px] uppercase tracking-[0.22em] ${
          tone === "accent" ? "text-accent" : "text-muted-foreground"
        }`}
      >
        {label}
      </div>
      <div className="flex flex-1 items-center justify-around gap-1">
        <TaskStat icon={Circle} label="K řešení" value={data.todo} color="text-muted-foreground" />
        <TaskStat
          icon={PlayCircle}
          label="Probíhá"
          value={data.inProgress}
          color="text-[color:var(--chart-2)]"
        />
        <TaskStat
          icon={CheckCircle2}
          label="Hotovo"
          value={data.done}
          color="text-[color:var(--chart-5)]"
        />
      </div>
    </Link>
  );
}

function TaskStat({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Circle;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} />
      <div className="min-w-0 leading-tight">
        <div className={`font-mono text-base font-bold tabular-nums leading-none ${color}`}>
          {value}
        </div>
        <div className="mt-0.5 truncate font-mono text-[8px] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </div>
      </div>
    </div>
  );
}

function ActPill({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Cable;
  label: string;
  value: number;
}) {
  const active = value > 0;
  return (
    <div
      className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 ${
        active
          ? "border-[color:var(--accent)]/40 bg-[color:var(--accent)]/10"
          : "border-border/40 bg-transparent"
      }`}
    >
      <Icon className={`h-3 w-3 ${active ? "text-accent" : "text-muted-foreground"}`} />
      <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div
        className={`font-mono text-xs font-bold tabular-nums ${
          active ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

