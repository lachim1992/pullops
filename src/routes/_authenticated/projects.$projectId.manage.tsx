import { createFileRoute, Link, useParams, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import {
  Cable,
  ClipboardList,
  FolderKanban,
  Loader2,
  Settings,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { getProject } from "@/lib/projects.functions";
import { getMyProjectCapabilities } from "@/lib/capabilities.functions";
import { useT } from "@/i18n";

export const Route = createFileRoute("/_authenticated/projects/$projectId/manage")({
  head: () => ({
    meta: [{ title: "Správa projektu · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: ProjectManagePage,
});

function ProjectManagePage() {
  const { projectId } = useParams({ from: "/_authenticated/projects/$projectId/manage" });
  const { t } = useT();
  const fetchProject = useServerFn(getProject);
  const fetchCaps = useServerFn(getMyProjectCapabilities);

  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => fetchProject({ data: { id: projectId } }),
  });
  const caps = useQuery({
    queryKey: ["me", "project-caps", projectId],
    queryFn: () => fetchCaps({ data: { projectId } }),
  });

  const canManage = caps.data?.canManage ?? false;

  return (
    <AppShell projectId={projectId}>
      {project.isLoading || caps.isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Načítám…
        </div>
      ) : !project.data ? (
        <div className="text-muted-foreground">Projekt nenalezen.</div>
      ) : !canManage ? (
        <div className="rounded-xl border border-border/60 bg-card/60 p-4 text-sm text-muted-foreground">
          Nemáte oprávnění pro správu tohoto projektu.
        </div>
      ) : (
        <>
          <motion.header
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="mb-4"
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-accent">
              {project.data.code}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">
                {t("nav.manage") ?? "Správa projektu"}
              </h1>
              <Badge variant="secondary" className="font-mono text-[10px]">
                {project.data.name}
              </Badge>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Konfigurace projektu, číselníky a přístupy.
            </p>
          </motion.header>

          <section>
            <div className="mb-2.5 flex items-center gap-3">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" />
              <h2 className="font-mono text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                Sekce správy
              </h2>
              <div className="hairline-gold h-px flex-1" />
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
              <ManageTile
                projectId={projectId}
                to="/projects/$projectId/cable-types"
                icon={Cable}
                title={t("nav.cableTypes") ?? "Typy kabelů"}
                description="Katalog typů kabelů projektu"
                tone="a"
              />
              <ManageTile
                projectId={projectId}
                to="/projects/$projectId/endpoint-kinds"
                icon={Settings}
                title={t("nav.endpointKinds") ?? "Typy endpointů"}
                description="Zásuvky, AP, kamery…"
                tone="b"
              />
              <ManageTile
                projectId={projectId}
                to="/projects/$projectId/patch-panels"
                icon={Wrench}
                title={t("nav.patchPanels") ?? "Patch panely"}
                description="Rozvaděče a panely"
                tone="c"
              />
              <ManageTile
                projectId={projectId}
                to="/projects/$projectId/cables"
                icon={Cable}
                title={t("nav.cables") ?? "Kabelový registr"}
                description="Seznam všech kabelů"
                tone="d"
              />
              <ManageTile
                projectId={projectId}
                to="/projects/$projectId/spools"
                icon={Cable}
                title={t("nav.spools") ?? "Fyzické špulky"}
                description="Skladová evidence"
                tone="e"
              />
              <ManageTile
                projectId={projectId}
                to="/projects/$projectId/members"
                icon={ClipboardList}
                title={t("nav.members") ?? "Členové"}
                description="Přístupy a role"
                tone="a"
              />
              <ManageTile
                projectId={projectId}
                to="/projects/$projectId/documents"
                icon={FolderKanban}
                title={t("nav.documents") ?? "Dokumenty"}
                description="Soubory a přílohy"
                tone="c"
              />
              <ManageTile
                projectId={projectId}
                to="/projects/$projectId/settings"
                icon={Settings}
                title={t("nav.settings") ?? "Nastavení"}
                description="Obecné parametry projektu"
                tone="b"
              />
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}

type Tone = "a" | "b" | "c" | "d" | "e";

const TONE: Record<Tone, { grad: string; border: string; icon: string }> = {
  a: {
    grad: "from-[color:var(--accent)]/25 to-transparent",
    border: "border-[color:var(--accent)]/40",
    icon: "text-accent bg-[color:var(--accent)]/10 border-[color:var(--accent)]/30",
  },
  b: {
    grad: "from-[color:var(--chart-2)]/25 to-transparent",
    border: "border-[color:var(--chart-2)]/40",
    icon: "text-[color:var(--chart-2)] bg-[color:var(--chart-2)]/10 border-[color:var(--chart-2)]/30",
  },
  c: {
    grad: "from-[color:var(--chart-4)]/25 to-transparent",
    border: "border-[color:var(--chart-4)]/40",
    icon: "text-[color:var(--chart-4)] bg-[color:var(--chart-4)]/10 border-[color:var(--chart-4)]/30",
  },
  d: {
    grad: "from-[color:var(--chart-5)]/25 to-transparent",
    border: "border-[color:var(--chart-5)]/40",
    icon: "text-[color:var(--chart-5)] bg-[color:var(--chart-5)]/10 border-[color:var(--chart-5)]/30",
  },
  e: {
    grad: "from-amber-500/20 to-transparent",
    border: "border-amber-500/40",
    icon: "text-amber-500 bg-amber-500/10 border-amber-500/30",
  },
};

function ManageTile({
  projectId,
  to,
  icon: Icon,
  title,
  description,
  tone,
}: {
  projectId: string;
  to: string;
  icon: typeof Cable;
  title: string;
  description: string;
  tone: Tone;
}) {
  const styles = TONE[tone];
  return (
    <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }} transition={{ duration: 0.15 }}>
      <Link
        to={to as never}
        params={{ projectId } as never}
        className={`group relative flex h-full flex-col overflow-hidden rounded-xl border ${styles.border} bg-card/70 p-3 backdrop-blur transition-colors hover:bg-card sm:p-4`}
      >
        <div
          className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${styles.grad} opacity-70`}
        />
        <div
          className={`relative flex h-9 w-9 items-center justify-center rounded-lg border ${styles.icon}`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="relative mt-2 min-w-0 font-display text-[13px] font-semibold uppercase leading-tight tracking-tight sm:text-sm">
          {title}
        </div>
        <div className="relative mt-1 text-[11px] leading-snug text-muted-foreground">
          {description}
        </div>
        <div className="relative mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-accent opacity-0 transition-opacity group-hover:opacity-100">
          Otevřít →
        </div>
      </Link>
    </motion.div>
  );
}
