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
  FolderKanban,
  Loader2,
  Route as RouteIcon,
  Users,
  Wrench,
  Zap,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getProject } from "@/lib/projects.functions";
import { getMyProjectCapabilities } from "@/lib/capabilities.functions";
import { getProjectProgress } from "@/lib/metrics.functions";
import { useT } from "@/i18n";

export const Route = createFileRoute("/_authenticated/projects/$projectId/")({
  head: () => ({
    meta: [{ title: "Project · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: ProjectDetailPage,
});

type HubTone = "manage" | "lobby" | "pull" | "completion";

function ProjectDetailPage() {
  const { projectId } = useParams({ from: "/_authenticated/projects/$projectId/" });
  const { t } = useT();
  const fetchProject = useServerFn(getProject);
  const fetchCaps = useServerFn(getMyProjectCapabilities);
  const fetchProgress = useServerFn(getProjectProgress);
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
          <motion.header
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="mb-10"
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-accent">
              {project.data.code}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl font-semibold tracking-tight md:text-4xl">
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
            {project.data.address && (
              <p className="mt-2 text-sm text-muted-foreground">{project.data.address}</p>
            )}
          </motion.header>

          {/* Four-mode hub */}
          <section className="mb-10">
            <div className="mb-4 flex items-center gap-3">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                {t("projectHub.sectionsTitle")}
              </h2>
              <div className="hairline-gold h-px flex-1" />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <HubTile
                tone="lobby"
                to="/projects/$projectId/lobby"
                projectId={projectId}
                icon={Camera}
                title={t("projectHub.lobbyTitle")}
                desc={t("projectHub.lobbyDesc")}
              />
              <HubTile
                tone="pull"
                to="/projects/$projectId/work"
                projectId={projectId}
                icon={Cable}
                title={t("projectHub.pullTitle")}
                desc={t("projectHub.pullDesc")}
              />
              <HubTile
                tone="completion"
                to="/projects/$projectId/completion"
                projectId={projectId}
                icon={CheckSquare}
                title={t("projectHub.completionTitle")}
                desc={t("projectHub.completionDesc")}
              />
              {canManage && (
                <HubTile
                  tone="manage"
                  to="/projects/$projectId/documents"
                  projectId={projectId}
                  icon={FolderKanban}
                  title={t("nav.manage")}
                  desc={t("projectHub.docsDesc")}
                />
              )}
            </div>
          </section>

          {canManage && (
            <section>
              <div className="mb-4 flex items-center gap-3">
                <h2 className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                  {t("nav.manage")}
                </h2>
                <div className="hairline-gold h-px flex-1" />
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <SectionLink projectId={projectId} to="/projects/$projectId/documents" icon={ClipboardList} title={t("projectHub.docsTitle")} desc={t("projectHub.docsDesc")} />
                <SectionLink projectId={projectId} to="/projects/$projectId/plans" icon={RouteIcon} title={t("projectHub.plansTitle")} desc={t("projectHub.plansDesc")} />
                <SectionLink projectId={projectId} to="/projects/$projectId/endpoints" icon={Wrench} title={t("projectHub.endpointsTitle")} desc={t("projectHub.endpointsDesc")} />
                <SectionLink projectId={projectId} to="/projects/$projectId/cable-types" icon={Cable} title={t("projectHub.ctypesTitle")} desc={t("projectHub.ctypesDesc")} />
                <SectionLink projectId={projectId} to="/projects/$projectId/cables" icon={Cable} title={t("projectHub.cablesTitle")} desc={t("projectHub.cablesDesc")} />
                <SectionLink projectId={projectId} to="/projects/$projectId/spools" icon={Cable} title={t("projectHub.spoolsTitle")} desc={t("projectHub.spoolsDesc")} />
                <SectionLink projectId={projectId} to="/projects/$projectId/members" icon={Users} title={t("projectHub.membersTitle")} desc={t("projectHub.membersDesc")} />
              </div>
            </section>
          )}

          <section className="mt-10 grid gap-3 md:grid-cols-2">
            <Info label={t("projectHub.infoCustomer")} value={project.data.customer ?? "—"} />
            <Info label={t("projectHub.infoTimezone")} value={project.data.timezone} />
            <Info
              label={t("projectHub.infoCompound")}
              value={project.data.use_compound_panel_port_ids ? t("common.yes") : t("common.no")}
            />
            <Info
              label={t("projectHub.infoHandling")}
              value={project.data.default_handling_factor?.toString() ?? "—"}
            />
          </section>
        </>
      )}
    </AppShell>
  );
}

const TONE_STYLES: Record<HubTone, string> = {
  manage: "from-[color:var(--gold-soft)]/15 to-transparent",
  lobby: "from-[color:var(--accent)]/20 to-transparent",
  pull: "from-[color:var(--chart-2)]/15 to-transparent",
  completion: "from-[color:var(--chart-5)]/15 to-transparent",
};

function HubTile({
  tone,
  to,
  projectId,
  icon: Icon,
  title,
  desc,
}: {
  tone: HubTone;
  to: string;
  projectId: string;
  icon: typeof Cable;
  title: string;
  desc: string;
}) {
  return (
    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
      <Link
        to={to as never}
        params={{ projectId } as never}
        className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/70 p-6 backdrop-blur transition-colors hover:border-[color:var(--accent)]/50"
      >
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${TONE_STYLES[tone]} opacity-70`} />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--accent)]/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
        <div className="relative flex h-11 w-11 items-center justify-center rounded-lg border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 text-accent shadow-[0_0_24px_-10px_var(--accent)]">
          <Icon className="h-5 w-5" />
        </div>
        <div className="relative mt-5 font-display text-xl font-semibold tracking-tight">{title}</div>
        <div className="relative mt-1 text-sm text-muted-foreground">{desc}</div>
      </Link>
    </motion.div>
  );
}

function SectionLink({
  projectId,
  to,
  icon: Icon,
  title,
  desc,
}: {
  projectId: string;
  to: string;
  icon: typeof Cable;
  title: string;
  desc: string;
}) {
  return (
    <Link
      to={to as never}
      params={{ projectId } as never}
      className="group flex items-start gap-3 rounded-xl border border-border/60 bg-card/50 p-4 backdrop-blur transition-colors hover:border-[color:var(--accent)]/50 hover:bg-card/80"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[color:var(--accent)]/25 bg-[color:var(--accent)]/10 text-accent">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="font-display font-semibold">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>
      </div>
    </Link>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-4 backdrop-blur">
      <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-display text-sm font-medium">{value}</div>
    </div>
  );
}
