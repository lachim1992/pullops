import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { z } from "zod";
import { AlertTriangle, FolderKanban, Loader2, Plus, Settings, Sparkles, Wrench } from "lucide-react";

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
import { getMyDashboardSummary } from "@/lib/metrics.functions";
import { seedCeskeBudejoviceDemo } from "@/lib/demoSeed.functions";
import { registerDocument } from "@/lib/documents.functions";
import { updateFloorPlan } from "@/lib/floorPlans.functions";
import { supabase } from "@/integrations/supabase/client";
import { useT } from "@/i18n";

const searchSchema = z.object({ org: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/dashboard")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [{ title: "Overview · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { t } = useT();
  const listOrgs = useServerFn(listMyOrganizations);
  const fetchSummary = useServerFn(getMyDashboardSummary);

  const orgs = useQuery({ queryKey: ["orgs"], queryFn: () => listOrgs() });
  const activeOrgId = search.org ?? orgs.data?.[0]?.id ?? undefined;

  const summary = useQuery({
    queryKey: ["dashboard-summary", activeOrgId],
    queryFn: () => fetchSummary({ data: { organizationId: activeOrgId! } }),
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

  return (
    <AppShell>
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-10 flex flex-wrap items-end justify-between gap-4"
      >
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-accent">
            {t("dashboard.organizationLabel")}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <select
              className="rounded-md border border-border bg-card px-3 py-2 font-display text-lg font-semibold tracking-tight focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-ring/40"
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
              <Button variant="ghost" size="sm" asChild>
                <Link to="/organizations/$orgId/settings" params={{ orgId: activeOrgId }}>
                  <Settings className="mr-1 h-4 w-4" />
                  {t("dashboard.orgSettings")}
                </Link>
              </Button>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {activeOrgId && <SeedDemoButton organizationId={activeOrgId} />}
          {activeOrgId && <NewProjectDialog organizationId={activeOrgId} />}
        </div>
      </motion.header>

      {/* Stat cards */}
      <section className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          icon={FolderKanban}
          label={t("dashboard.statsProjects")}
          value={summary.data?.totals.projects ?? 0}
          tone="accent"
        />
        <StatCard
          icon={AlertTriangle}
          label={t("dashboard.statsOpenDefects")}
          value={summary.data?.totals.myOpenDefects ?? 0}
          tone="warn"
        />
        <StatCard
          icon={Wrench}
          label={t("dashboard.statsOpenTasks")}
          value={summary.data?.totals.myOpenTasks ?? 0}
          tone="info"
        />
      </section>

      <section>
        <div className="mb-4 flex items-center gap-3">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
            {t("dashboard.projectsTitle")}
          </h2>
          <div className="hairline-gold h-px flex-1" />
        </div>

        {summary.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : !summary.data || summary.data.projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-card/30 p-12 text-center text-sm text-muted-foreground">
            {t("dashboard.noProjects")}
          </div>
        ) : (
          <motion.div
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          >
            {summary.data.projects.map((p) => (
              <motion.div
                key={p.id}
                variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
              >
                <Link
                  to="/projects/$projectId"
                  params={{ projectId: p.id }}
                  className="group relative block overflow-hidden rounded-xl border border-border/60 bg-card/60 p-5 backdrop-blur transition-all hover:-translate-y-0.5 hover:border-[color:var(--accent)]/50 hover:shadow-[0_20px_50px_-30px_var(--accent)]"
                >
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--accent)]/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 text-accent">
                      <FolderKanban className="h-5 w-5" />
                    </div>
                    <div className="flex flex-wrap justify-end gap-1">
                      {p.is_demo && (
                        <Badge variant="outline" className="border-[color:var(--accent)]/40 font-mono text-[10px] text-accent">
                          DEMO
                        </Badge>
                      )}
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {p.status}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                    {p.code}
                  </div>
                  <div className="mt-1 font-display text-lg font-semibold tracking-tight">
                    {p.name}
                  </div>
                  <div className="mt-4">
                    <div className="mb-1 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      <span>{t("dashboard.progressLabel")}</span>
                      <span className="text-accent">{p.progressPct}%</span>
                    </div>
                    <Progress value={p.progressPct} className="h-1.5" />
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span>
                        {p.cablesTotal > 0
                          ? `${p.cablesTotal} ${t("dashboard.cablesLabel").toLowerCase()}`
                          : t("dashboard.noCables")}
                      </span>
                      {p.openDefects > 0 && (
                        <span className="inline-flex items-center gap-1 text-amber-500">
                          <AlertTriangle className="h-3 w-3" />
                          {p.openDefects} {t("dashboard.defectsLabel")}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </section>
    </AppShell>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof FolderKanban;
  label: string;
  value: number;
  tone: "accent" | "warn" | "info";
}) {
  const toneCls =
    tone === "warn"
      ? "text-amber-500 border-amber-500/30 bg-amber-500/10"
      : tone === "info"
        ? "text-sky-400 border-sky-400/30 bg-sky-400/10"
        : "text-accent border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10";
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card/50 p-4 backdrop-blur">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${toneCls}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          {label}
        </div>
        <div className="mt-0.5 font-display text-2xl font-semibold">{value}</div>
      </div>
    </div>
  );
}

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
        <Button className="rounded-full">
          <Plus className="mr-1 h-4 w-4" />
          {t("dashboard.newProject")}
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
    <Button variant="outline" onClick={run} disabled={loading} className="rounded-full border-border/60 bg-card/40 backdrop-blur">
      {loading ? (
        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
      ) : (
        <Sparkles className="mr-1 h-4 w-4 text-accent" />
      )}
      {progress ?? t("dashboard.seedCta")}
    </Button>
  );
}
