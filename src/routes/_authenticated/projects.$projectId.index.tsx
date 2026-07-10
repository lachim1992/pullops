import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getProject } from "@/lib/projects.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/")({
  head: () => ({
    meta: [{ title: "Projekt · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: ProjectDetailPage,
});

function ProjectDetailPage() {
  const { projectId } = useParams({ from: "/_authenticated/projects/$projectId/" });
  const fetchProject = useServerFn(getProject);
  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => fetchProject({ data: { id: projectId } }),
  });

  return (
    <AppShell projectId={projectId}>
      {project.isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Načítám projekt…
        </div>
      ) : !project.data ? (
        <div className="text-muted-foreground">Projekt nenalezen.</div>
      ) : (
        <>
          <header className="mb-8">
            <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              {project.data.code}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{project.data.name}</h1>
              <Badge variant="secondary" className="font-mono text-[10px]">
                {project.data.status}
              </Badge>
              {project.data.is_demo && (
                <Badge variant="outline" className="font-mono text-[10px]">
                  DEMO
                </Badge>
              )}
            </div>
            {project.data.address && (
              <p className="mt-1 text-sm text-muted-foreground">{project.data.address}</p>
            )}
          </header>

          <div className="grid gap-4 md:grid-cols-2">
            <Info label="Zákazník" value={project.data.customer ?? "—"} />
            <Info label="Časová zóna" value={project.data.timezone} />
            <Info
              label="Použít složené panel/port ID"
              value={project.data.use_compound_panel_port_ids ? "Ano" : "Ne"}
            />
            <Info
              label="Default handling factor"
              value={project.data.default_handling_factor?.toString() ?? "—"}
            />
          </div>

          <div className="mt-10 rounded-sm border border-dashed border-border p-6">
            <h2 className="text-sm font-semibold">Obsah přijde v Checkpointu B</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Dokumentace, plány s kalibrací, endpointy a kabelový registr.
              V Checkpointu A je aktivní pouze základní struktura projektu, členů,
              rolí a auditu.
            </p>
            <div className="mt-4 flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/projects/$projectId/members" params={{ projectId }}>
                  Členové
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/projects/$projectId/settings" params={{ projectId }}>
                  Nastavení
                </Link>
              </Button>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-border bg-card p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm">{value}</div>
    </div>
  );
}
