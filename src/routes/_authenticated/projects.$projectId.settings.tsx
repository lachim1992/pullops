import { useState, useEffect } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getProject, updateProject } from "@/lib/projects.functions";

const STATUSES = ["planning", "active", "on_hold", "completed", "archived"] as const;

export const Route = createFileRoute("/_authenticated/projects/$projectId/settings")({
  head: () => ({
    meta: [{ title: "Nastavení projektu · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { projectId } = useParams({ from: "/_authenticated/projects/$projectId/settings" });
  const fetchProject = useServerFn(getProject);
  const updateFn = useServerFn(updateProject);
  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => fetchProject({ data: { id: projectId } }),
  });

  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (project.data && !form) {
      setForm({ ...project.data });
    }
  }, [project.data, form]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSubmitting(true);
    try {
      await updateFn({
        data: {
          id: projectId,
          name: String(form.name ?? ""),
          address: (form.address as string) || null,
          customer: (form.customer as string) || null,
          status: form.status as (typeof STATUSES)[number],
          default_cable_type: (form.default_cable_type as string) || null,
          default_rack_reserve_m: numOrNull(form.default_rack_reserve_m),
          default_endpoint_reserve_m: numOrNull(form.default_endpoint_reserve_m),
          default_vertical_allowance_m: numOrNull(form.default_vertical_allowance_m),
          default_handling_factor: numOrNull(form.default_handling_factor),
          use_compound_panel_port_ids: !!form.use_compound_panel_port_ids,
          is_demo: !!form.is_demo,
        },
      });
      toast.success("Uloženo");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    } finally {
      setSubmitting(false);
    }
  }

  if (!form) {
    return (
      <AppShell projectId={projectId}>
        <Loader2 className="h-4 w-4 animate-spin" />
      </AppShell>
    );
  }

  return (
    <AppShell projectId={projectId}>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Nastavení projektu</h1>
      </header>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-4">
        <Field label="Název">
          <Input
            value={String(form.name ?? "")}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </Field>
        <Field label="Adresa">
          <Input
            value={String(form.address ?? "")}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
        </Field>
        <Field label="Zákazník">
          <Input
            value={String(form.customer ?? "")}
            onChange={(e) => setForm({ ...form, customer: e.target.value })}
          />
        </Field>
        <Field label="Stav">
          <Select
            value={String(form.status)}
            onValueChange={(v) => setForm({ ...form, status: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Defaultní typ kabelu">
          <Input
            value={String(form.default_cable_type ?? "")}
            onChange={(e) => setForm({ ...form, default_cable_type: e.target.value })}
            placeholder="např. Cat6 U/UTP"
          />
        </Field>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Rezerva u racku [m]">
            <Input
              type="number"
              step="0.1"
              value={String(form.default_rack_reserve_m ?? "")}
              onChange={(e) => setForm({ ...form, default_rack_reserve_m: e.target.value })}
            />
          </Field>
          <Field label="Rezerva u endpointu [m]">
            <Input
              type="number"
              step="0.1"
              value={String(form.default_endpoint_reserve_m ?? "")}
              onChange={(e) => setForm({ ...form, default_endpoint_reserve_m: e.target.value })}
            />
          </Field>
          <Field label="Vertikální rezerva [m]">
            <Input
              type="number"
              step="0.1"
              value={String(form.default_vertical_allowance_m ?? "")}
              onChange={(e) => setForm({ ...form, default_vertical_allowance_m: e.target.value })}
            />
          </Field>
          <Field label="Handling factor">
            <Input
              type="number"
              step="0.01"
              value={String(form.default_handling_factor ?? "")}
              onChange={(e) => setForm({ ...form, default_handling_factor: e.target.value })}
            />
          </Field>
        </div>

        <div className="flex items-center justify-between rounded-sm border border-border p-3">
          <div>
            <div className="text-sm font-medium">Použít složené panel/port ID</div>
            <div className="text-xs text-muted-foreground">
              První číslice human ID = panel, poslední dvě = port.
            </div>
          </div>
          <Switch
            checked={!!form.use_compound_panel_port_ids}
            onCheckedChange={(v) => setForm({ ...form, use_compound_panel_port_ids: v })}
          />
        </div>

        <div className="flex items-center justify-between rounded-sm border border-border p-3">
          <div>
            <div className="text-sm font-medium">Demo projekt</div>
            <div className="text-xs text-muted-foreground">Označí tento projekt jako ukázkový.</div>
          </div>
          <Switch
            checked={!!form.is_demo}
            onCheckedChange={(v) => setForm({ ...form, is_demo: v })}
          />
        </div>

        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Uložit
        </Button>
      </form>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function numOrNull(v: unknown): number | null {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
