import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { z } from "zod";
import {
  Activity,
  AlertTriangle,
  Cable,
  CheckCircle2,
  ChevronRight,
  Clock,
  FolderKanban,
  Loader2,
  Plug,
  Plus,
  Ruler,
  Server,
  Settings,
  Sparkles,
  Trophy,
  Wrench,
  Zap,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { listMyOrganizations } from "@/lib/orgs.functions";
import { createProject } from "@/lib/projects.functions";
import { getOrgDashboard, type OrgDashboard } from "@/lib/metrics.functions";
import { seedCeskeBudejoviceDemo } from "@/lib/demoSeed.functions";
import { registerDocument } from "@/lib/documents.functions";
import { updateFloorPlan } from "@/lib/floorPlans.functions";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/i18n";

const searchSchema = z.object({ org: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "Přehled · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { t } = useT();
  const listOrgs = useServerFn(listMyOrganizations);
  const fetchDash = useServerFn(getOrgDashboard);

  const orgs = useQuery({ queryKey: ["orgs"], queryFn: () => listOrgs() });
  const activeOrgId = search.org ?? orgs.data?.[0]?.id ?? undefined;
  const activeOrg = orgs.data?.find((o) => o.id === activeOrgId);

  const dash = useQuery({
    queryKey: ["org-dashboard", activeOrgId],
    queryFn: () => fetchDash({ data: { organizationId: activeOrgId! } }),
    enabled: !!activeOrgId,
  });

  if (orgs.isLoading) {
    return (
      <AppShell>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("common.loading")}
        </div>
      </AppShell>
    );
  }

  if (!orgs.data || orgs.data.length === 0) {
    return (
      <AppShell>
        <EmptyOrgs />
      </AppShell>
    );
  }

  const k = dash.data?.kpis;

  return (
    <AppShell>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:mb-8 sm:flex sm:flex-wrap sm:justify-between"
      >
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-accent">
            Organizace
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <select
              className="min-w-0 max-w-[220px] truncate rounded-md border border-border bg-card px-2.5 py-1.5 font-display text-base font-semibold tracking-tight focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-ring/40 sm:max-w-none sm:px-3 sm:py-2 sm:text-lg"
              value={activeOrgId}
              onChange={(e) => navigate({ to: "/dashboard", search: { org: e.target.value } })}
            >
              {orgs.data.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            {activeOrgId && (
              <Button variant="ghost" size="sm" asChild className="shrink-0 px-2">
                <Link to="/organizations/$orgId/settings" params={{ orgId: activeOrgId }}>
                  <Settings className="h-4 w-4" />
                  <span className="ml-1 hidden sm:inline">Nastavení</span>
                </Link>
              </Button>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {activeOrgId && <SeedDemoButton organizationId={activeOrgId} />}
          {activeOrgId && <NewProjectDialog organizationId={activeOrgId} />}
        </div>
      </motion.header>

      {dash.isLoading || !k ? (
        <DashboardSkeleton />
      ) : (
        <>
          {/* ── HERO progress row ───────────────────────────────────── */}
          <HeroProgress kpis={k} orgName={activeOrg?.name ?? ""} />

          {/* ── KPI strip: horizontal scroll on mobile, grid on desktop ── */}
          <KpiStrip kpis={k} />

          {/* ── Fun / gamification ridge ─────────────────────────────── */}
          <FunRidge fun={dash.data!.fun} kpis={k} />

          {/* ── Chart + activity (stack on mobile, 2col on desktop) ─── */}
          <section className="mt-6 grid gap-4 lg:grid-cols-3">
            <TrendChart daily={dash.data!.daily} />
            <ActivityFeed activity={dash.data!.activity} />
          </section>

          {/* ── Projects (horizontal snap on mobile, grid on desktop) ── */}
          <TopProjects projects={dash.data!.topProjects} />
        </>
      )}
    </AppShell>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function HeroProgress({ kpis, orgName }: { kpis: OrgDashboard["kpis"]; orgName: string }) {
  return (
    <section className="relative mb-5 overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card/80 via-card/60 to-card/40 p-4 backdrop-blur sm:p-6">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--accent)]/60 to-transparent" />
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="min-w-0">
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
            Celkový postup · {orgName || "—"}
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <div className="font-display text-4xl font-black tracking-tight text-foreground sm:text-5xl">
              {kpis.progressPct}
              <span className="text-2xl text-muted-foreground sm:text-3xl">%</span>
            </div>
            <div className="hidden text-xs text-muted-foreground sm:block">
              {kpis.cablesTested} z {kpis.cablesTotal} kabelů otestováno
            </div>
          </div>
          <div className="mt-3">
            <Progress value={kpis.progressPct} className="h-2" />
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              <span>
                <span className="text-accent">{kpis.cablesPulled}</span> nataženo
              </span>
              <span>
                <span className="text-sky-400">{kpis.cablesTerminated}</span> zakončeno
              </span>
              <span>
                <span className="text-emerald-400">{kpis.cablesTested}</span> otestováno
              </span>
            </div>
          </div>
        </div>
        {/* Big meters counter */}
        <div className="hidden shrink-0 text-right sm:block">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Metry
          </div>
          <div className="font-display text-3xl font-black text-accent">
            {formatNumber(kpis.metersPulled)}
          </div>
          <div className="font-mono text-[10px] text-muted-foreground">
            z {formatNumber(kpis.metersTotal)} m
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Endpointy
          </div>
          <div className="font-display text-2xl font-black text-foreground sm:text-3xl">
            {kpis.endpointsDone}
            <span className="text-base text-muted-foreground">/{kpis.endpointsTotal}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function KpiStrip({ kpis }: { kpis: OrgDashboard["kpis"] }) {
  const tiles: Array<{
    icon: typeof FolderKanban;
    label: string;
    value: string | number;
    sub?: string;
    tone: "accent" | "warn" | "info" | "ok" | "muted";
    to?: string;
  }> = [
    {
      icon: FolderKanban,
      label: "Projekty",
      value: kpis.projects,
      sub: `${kpis.projectsActive} aktivní`,
      tone: "accent",
    },
    {
      icon: Ruler,
      label: "Metry pulled",
      value: formatNumber(kpis.metersPulled),
      sub: `${formatNumber(kpis.metersTotal)} plán`,
      tone: "accent",
    },
    {
      icon: Cable,
      label: "Kabely",
      value: `${kpis.cablesTerminated}/${kpis.cablesTotal}`,
      sub: "zakončeno",
      tone: "info",
    },
    {
      icon: Plug,
      label: "Endpointy",
      value: `${kpis.endpointsDone}/${kpis.endpointsTotal}`,
      sub: "hotovo",
      tone: "info",
    },
    {
      icon: Server,
      label: "Racky · panely",
      value: `${kpis.racks} · ${kpis.patchPanels}`,
      sub: `${kpis.portsUsed}/${kpis.portsTotal} portů`,
      tone: "muted",
    },
    {
      icon: Clock,
      label: "Pull plány",
      value: kpis.plansActive,
      sub: `${kpis.plansToday} dnes · ${kpis.plansReady} ready`,
      tone: "accent",
    },
    {
      icon: AlertTriangle,
      label: "Otevřené závady",
      value: kpis.openDefects,
      sub: `${kpis.myOpenDefects} mých`,
      tone: kpis.openDefects > 0 ? "warn" : "ok",
    },
    {
      icon: Wrench,
      label: "Otevřené úkoly",
      value: kpis.myOpenTasks,
      sub: "napříč projekty",
      tone: "info",
    },
  ];

  return (
    <section className="-mx-4 mb-5 sm:mx-0">
      <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-2 sm:grid sm:snap-none sm:grid-cols-3 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4 xl:grid-cols-8">
        {tiles.map((t, i) => (
          <KpiTile key={i} {...t} />
        ))}
      </div>
    </section>
  );
}

function KpiTile({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: typeof FolderKanban;
  label: string;
  value: string | number;
  sub?: string;
  tone: "accent" | "warn" | "info" | "ok" | "muted";
}) {
  const toneCls =
    tone === "warn"
      ? "text-amber-500 border-amber-500/30 bg-amber-500/10"
      : tone === "info"
        ? "text-sky-400 border-sky-400/30 bg-sky-400/10"
        : tone === "ok"
          ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10"
          : tone === "muted"
            ? "text-muted-foreground border-border/60 bg-muted/30"
            : "text-accent border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10";
  return (
    <div className="min-w-[9.5rem] shrink-0 snap-start rounded-xl border border-border/60 bg-card/60 p-3 backdrop-blur sm:min-w-0">
      <div className="flex items-center gap-2">
        <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-md border ${toneCls}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </div>
      </div>
      <div className="mt-2 font-display text-2xl font-black leading-none tracking-tight">
        {value}
      </div>
      {sub && (
        <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">{sub}</div>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function FunRidge({
  fun,
  kpis,
}: {
  fun: OrgDashboard["fun"];
  kpis: OrgDashboard["kpis"];
}) {
  const items: Array<{ icon: typeof Trophy; label: string; value: string; tag?: string }> = [
    fun.longestCable
      ? {
          icon: Cable,
          label: "Nejdelší kabel",
          value: `${formatNumber(fun.longestCable.length_m)} m`,
          tag: `${fun.longestCable.projectCode ?? "—"} · ${fun.longestCable.code}`,
        }
      : { icon: Cable, label: "Nejdelší kabel", value: "—" },
    fun.topTechnician
      ? {
          icon: Trophy,
          label: "Top technik · 30 dní",
          value: fun.topTechnician.name,
          tag: `${fun.topTechnician.count}× zakončení`,
        }
      : { icon: Trophy, label: "Top technik · 30 dní", value: "—" },
    fun.daysSinceDefect != null
      ? {
          icon: Zap,
          label: "Dní od poslední závady",
          value: String(fun.daysSinceDefect),
          tag: fun.daysSinceDefect >= 7 ? "🔥 streak" : "sledujeme",
        }
      : { icon: Zap, label: "Dní od poslední závady", value: "∞", tag: "žádná závada" },
    {
      icon: CheckCircle2,
      label: "Hotové kabely",
      value: `${kpis.cablesDone}`,
      tag: `${kpis.cablesTotal ? Math.round((kpis.cablesDone / kpis.cablesTotal) * 100) : 0}% z projektu`,
    },
  ];

  return (
    <section className="-mx-4 mb-5 sm:mx-0">
      <div className="mb-2 flex items-center gap-3 px-4 sm:px-0">
        <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
          Highlighty
        </div>
        <div className="hairline-gold h-px flex-1" />
      </div>
      <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-2 sm:grid sm:snap-none sm:grid-cols-2 sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
        {items.map((it, i) => (
          <div
            key={i}
            className="relative min-w-[13rem] shrink-0 snap-start overflow-hidden rounded-xl border border-[color:var(--accent)]/20 bg-gradient-to-br from-[color:var(--accent)]/10 via-card/60 to-card/40 p-3 sm:min-w-0"
          >
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
              <it.icon className="h-3.5 w-3.5" />
              {it.label}
            </div>
            <div className="mt-1.5 truncate font-display text-xl font-black tracking-tight">
              {it.value}
            </div>
            {it.tag && (
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{it.tag}</div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function TrendChart({ daily }: { daily: OrgDashboard["daily"] }) {
  const data = daily.map((d) => ({
    day: d.date.slice(5), // MM-DD
    pulled: d.pulled,
    terminated: d.terminated,
    tested: d.tested,
  }));
  const empty = data.every((d) => d.pulled + d.terminated + d.tested === 0);

  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur lg:col-span-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
            Aktivita · 14 dní
          </div>
          <div className="mt-0.5 font-display text-base font-semibold">Zakončení / testování</div>
        </div>
        <div className="flex gap-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-sky-400" />
            zakon.
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-emerald-400" />
            test.
          </span>
        </div>
      </div>
      <div className="h-40 sm:h-52">
        {empty ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Zatím žádná aktivita v tomto období.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ left: -20, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="gT" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(200 90% 55%)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="hsl(200 90% 55%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gTest" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(150 70% 50%)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="hsl(150 70% 50%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 3" stroke="hsl(var(--border))" opacity={0.3} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <RTooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="terminated"
                stroke="hsl(200 90% 55%)"
                fill="url(#gT)"
                strokeWidth={2}
              />
              <Area
                type="monotone"
                dataKey="tested"
                stroke="hsl(150 70% 50%)"
                fill="url(#gTest)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function ActivityFeed({ activity }: { activity: OrgDashboard["activity"] }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur">
      <div className="mb-3 flex items-center gap-2">
        <Activity className="h-4 w-4 text-accent" />
        <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
          Poslední aktivita
        </div>
      </div>
      {activity.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted-foreground">Zatím ticho.</div>
      ) : (
        <ul className="space-y-2 max-h-64 overflow-y-auto lg:max-h-none">
          {activity.map((e, i) => (
            <li key={i} className="flex items-start gap-2 border-l-2 border-border/40 pl-2">
              <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{e.label}</div>
                <div className="font-mono text-[10px] text-muted-foreground">
                  {e.projectCode ?? "—"} · {formatRelative(e.date)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function TopProjects({ projects }: { projects: OrgDashboard["topProjects"] }) {
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
          Projekty
        </h2>
        <div className="hairline-gold h-px flex-1" />
      </div>
      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/70 bg-card/30 p-12 text-center text-sm text-muted-foreground">
          Zatím žádné projekty.
        </div>
      ) : (
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:snap-none sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3"
        >
          {projects.map((p) => (
            <motion.div
              key={p.id}
              variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
              className="min-w-[17rem] shrink-0 snap-start sm:min-w-0"
            >
              <Link
                to="/projects/$projectId"
                params={{ projectId: p.id }}
                className="group relative block h-full overflow-hidden rounded-xl border border-border/60 bg-card/60 p-4 backdrop-blur transition-all hover:-translate-y-0.5 hover:border-[color:var(--accent)]/50 hover:shadow-[0_20px_50px_-30px_var(--accent)]"
              >
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--accent)]/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="flex items-start justify-between gap-2">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 text-accent">
                    <FolderKanban className="h-4 w-4" />
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    {p.is_demo && (
                      <Badge
                        variant="outline"
                        className="border-[color:var(--accent)]/40 font-mono text-[9px] text-accent"
                      >
                        DEMO
                      </Badge>
                    )}
                    <Badge variant="secondary" className="font-mono text-[9px]">
                      {p.status}
                    </Badge>
                  </div>
                </div>
                <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                  {p.code}
                </div>
                <div className="mt-0.5 truncate font-display text-base font-semibold tracking-tight">
                  {p.name}
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    <span>Postup</span>
                    <span className="text-accent">{p.progressPct}%</span>
                  </div>
                  <Progress value={p.progressPct} className="h-1.5" />
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Ruler className="h-3 w-3" />
                      {formatNumber(p.meters)} m
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Cable className="h-3 w-3" />
                      {p.cablesTotal}
                    </span>
                    {p.openDefects > 0 && (
                      <span className="inline-flex items-center gap-1 text-amber-500">
                        <AlertTriangle className="h-3 w-3" />
                        {p.openDefects}
                      </span>
                    )}
                    <ChevronRight className="ml-auto h-3.5 w-3.5 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 group-hover:text-accent" />
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-32 animate-pulse rounded-2xl border border-border/60 bg-card/40" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl border border-border/60 bg-card/30" />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-2xl border border-border/60 bg-card/30" />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return n.toLocaleString("cs-CZ");
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "právě teď";
  if (m < 60) return `před ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `před ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `před ${d} dny`;
  return new Date(iso).toLocaleDateString("cs-CZ");
}

/* ────────────────────────────────────────────────────────────────────── */

function EmptyOrgs() {
  const { t } = useT();
  return (
    <div className="mx-auto max-w-md py-24 text-center">
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        {t("dashboard.noOrgsTitle")}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("dashboard.noOrgsBody")}</p>
      <Button asChild className="mt-6 rounded-full">
        <Link to="/onboarding">{t("dashboard.createOrg")}</Link>
      </Button>
    </div>
  );
}

function NewProjectDialog({ organizationId }: { organizationId: string }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { t } = useT();
  const create = useServerFn(createProject);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { id } = await create({
        data: { organizationId, code, name, timezone: "Europe/Prague", is_demo: false },
      });
      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["org-dashboard"] });
      toast.success(t("dashboard.projectCreated"));
      setOpen(false);
      setCode("");
      setName("");
      navigate({ to: "/projects/$projectId", params: { projectId: id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("dashboard.createError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="rounded-full" size="sm">
          <Plus className="h-4 w-4 sm:mr-1" />
          <span className="hidden sm:inline">{t("dashboard.newProject")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">{t("dashboard.newProject")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="code">{t("dashboard.projectCode")}</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t("dashboard.projectCodePh")}
              required
              maxLength={64}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">{t("dashboard.projectName")}</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("dashboard.projectNamePh")}
              required
              maxLength={200}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting} className="rounded-full">
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function SeedDemoButton({ organizationId }: { organizationId: string }) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const { t } = useT();
  const seed = useServerFn(seedCeskeBudejoviceDemo);
  const registerFn = useServerFn(registerDocument);
  const updatePlanFn = useServerFn(updateFloorPlan);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function run() {
    if (!confirm(t("dashboard.seedConfirm"))) return;
    setLoading(true);
    setProgress(t("dashboard.seedingProject"));
    try {
      const { projectId, floorPlanId, panels, cables, endpoints } = await seed({
        data: { organizationId },
      });

      const DEMO_DOCS: Array<{
        file: string;
        title: string;
        kind: "FLOOR_PLAN" | "SCHEMATIC" | "OTHER";
        floorPlanBackground?: boolean;
      }> = [
        {
          file: "floorplan-nove.pdf",
          title: "Půdorys – nové konstrukce",
          kind: "FLOOR_PLAN",
          floorPlanBackground: true,
        },
        { file: "floorplan-bourane.pdf", title: "Půdorys – bourané konstrukce", kind: "FLOOR_PLAN" },
        { file: "cb2-kvs-plan.pdf", title: "KVS plán", kind: "SCHEMATIC" },
        { file: "cb-lan.pdf", title: "LAN schéma", kind: "SCHEMATIC" },
        { file: "cb-patch-panely.pdf", title: "Patch panely (PDF)", kind: "SCHEMATIC" },
        { file: "cb2-informace.pdf", title: "ČB2 – informace", kind: "OTHER" },
      ];

      setProgress(t("dashboard.seedingDocs"));
      let backgroundDocId: string | null = null;
      for (const d of DEMO_DOCS) {
        const res = await fetch(`/demo/${d.file}`);
        if (!res.ok) continue;
        const blob = await res.blob();
        const path = `${projectId}/${crypto.randomUUID()}-${d.file}`;
        const up = await supabase.storage
          .from("project-documents")
          .upload(path, blob, { contentType: "application/pdf" });
        if (up.error) continue;
        const { id } = await registerFn({
          data: {
            projectId,
            kind: d.kind,
            title: d.title,
            storagePath: path,
            mimeType: "application/pdf",
          },
        });
        if (d.floorPlanBackground) backgroundDocId = id;
      }

      if (backgroundDocId) {
        await updatePlanFn({ data: { id: floorPlanId, documentId: backgroundDocId } });
      }

      await queryClient.invalidateQueries({ queryKey: ["projects"] });
      await queryClient.invalidateQueries({ queryKey: ["org-dashboard"] });
      toast.success(`${t("dashboard.seedDone")}: ${panels} · ${endpoints} · ${cables}`);
      navigate({ to: "/projects/$projectId", params: { projectId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  return (
    <Button
      variant="outline"
      onClick={run}
      disabled={loading}
      size="sm"
      className="rounded-full border-border/60 bg-card/40 backdrop-blur"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin sm:mr-1" />
      ) : (
        <Sparkles className="h-4 w-4 text-accent sm:mr-1" />
      )}
      <span className="hidden sm:inline">{progress ?? t("dashboard.seedCta")}</span>
    </Button>
  );
}
