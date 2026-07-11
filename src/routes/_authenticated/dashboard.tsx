import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { FolderKanban, Loader2, Plus, Settings, Sparkles } from "lucide-react";

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
import { listMyOrganizations } from "@/lib/orgs.functions";
import { createProject, listMyProjects } from "@/lib/projects.functions";
import { seedCeskeBudejoviceDemo } from "@/lib/demoSeed.functions";
import { registerDocument } from "@/lib/documents.functions";
import { updateFloorPlan } from "@/lib/floorPlans.functions";
import { supabase } from "@/integrations/supabase/client";

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
  const listOrgs = useServerFn(listMyOrganizations);
  const listProjects = useServerFn(listMyProjects);

  const orgs = useQuery({ queryKey: ["orgs"], queryFn: () => listOrgs() });
  const activeOrgId = search.org ?? orgs.data?.[0]?.id ?? undefined;

  const projects = useQuery({
    queryKey: ["projects", activeOrgId],
    queryFn: () => listProjects({ data: { organizationId: activeOrgId! } }),
    enabled: !!activeOrgId,
  });

  if (orgs.isLoading) {
    return (
      <AppShell>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Načítám…
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
      <header className="mb-8 flex items-center justify-between">
        <div>
          <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Organizace
          </div>
          <div className="mt-1 flex items-center gap-2">
            <select
              className="rounded-sm border border-input bg-background px-3 py-1.5 text-sm"
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
                  Nastavení
                </Link>
              </Button>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {activeOrgId && <SeedDemoButton organizationId={activeOrgId} />}
          {activeOrgId && <NewProjectDialog organizationId={activeOrgId} />}
        </div>
      </header>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Projekty
        </h2>
        {projects.isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Načítám…
          </div>
        ) : !projects.data || projects.data.length === 0 ? (
          <div className="rounded-sm border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Zatím žádný projekt. Vytvořte první.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {projects.data.map((p) => (
              <Link
                key={p.id}
                to="/projects/$projectId"
                params={{ projectId: p.id }}
                className="rounded-sm border border-border bg-card p-4 transition-colors hover:border-accent"
              >
                <div className="flex items-start justify-between">
                  <FolderKanban className="h-5 w-5 text-accent" />
                  <div className="flex gap-1">
                    {p.is_demo && (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        DEMO
                      </Badge>
                    )}
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {p.status}
                    </Badge>
                  </div>
                </div>
                <div className="mt-3 font-mono text-xs text-muted-foreground">{p.code}</div>
                <div className="mt-1 font-semibold">{p.name}</div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function EmptyOrgs() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="text-xl font-semibold">Nejste v žádné organizaci</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Vytvořte první organizaci a začněte s projekty.
      </p>
      <Button asChild className="mt-6">
        <Link to="/onboarding">Vytvořit organizaci</Link>
      </Button>
    </div>
  );
}

function NewProjectDialog({ organizationId }: { organizationId: string }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
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
      toast.success("Projekt vytvořen");
      setOpen(false);
      setCode("");
      setName("");
      navigate({ to: "/projects/$projectId", params: { projectId: id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba při vytváření");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1 h-4 w-4" />
          Nový projekt
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nový projekt</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="code">Kód projektu</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="např. CB2"
              required
              maxLength={64}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Název</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="např. McDonald's České Budějovice II"
              required
              maxLength={200}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Vytvořit
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
  const seed = useServerFn(seedCeskeBudejoviceDemo);
  const registerFn = useServerFn(registerDocument);
  const updatePlanFn = useServerFn(updateFloorPlan);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function run() {
    if (!confirm("Vytvořit demo projekt McDonald's České Budějovice II?")) return;
    setLoading(true);
    setProgress("Zakládám projekt…");
    try {
      const { projectId, floorPlanId, panels, cables, endpoints } = await seed({
        data: { organizationId },
      });

      // Attach demo documents (PDFs served from /public/demo).
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
        {
          file: "floorplan-bourane.pdf",
          title: "Půdorys – bourané konstrukce",
          kind: "FLOOR_PLAN",
        },
        { file: "cb2-kvs-plan.pdf", title: "KVS plán", kind: "SCHEMATIC" },
        { file: "cb-lan.pdf", title: "LAN schéma", kind: "SCHEMATIC" },
        { file: "cb-patch-panely.pdf", title: "Patch panely (PDF)", kind: "SCHEMATIC" },
        { file: "cb2-informace.pdf", title: "ČB2 – informace", kind: "OTHER" },
      ];

      setProgress("Nahrávám dokumenty…");
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
      toast.success(`Demo vytvořeno: ${panels} panelů, ${endpoints} endpointů, ${cables} kabelů`);
      navigate({ to: "/projects/$projectId", params: { projectId } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  return (
    <Button variant="outline" onClick={run} disabled={loading}>
      {loading ? (
        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
      ) : (
        <Sparkles className="mr-1 h-4 w-4" />
      )}
      {progress ?? "Nahrát demo ČB2"}
    </Button>
  );
}
