import { useMemo, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, RefreshCw, Trash2 } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  createCable,
  deleteCable,
  listCables,
  recomputeProjectLengths,
  updateCable,
} from "@/lib/cables.functions";
import { listCableTypes } from "@/lib/cableTypes.functions";
import { listEndpoints } from "@/lib/endpoints.functions";
import { listPatchPortsForProject } from "@/lib/patchPanels.functions";

const STATUSES = ["PLANNED", "PULLED", "TERMINATED", "DONE", "CANCELLED"] as const;
type Status = (typeof STATUSES)[number];

export const Route = createFileRoute("/_authenticated/projects/$projectId/cables/")({
  component: CablesPage,
});

function CablesPage() {
  const { projectId } = useParams({ from: "/_authenticated/projects/$projectId/cables/" });
  const listFn = useServerFn(listCables);
  const delFn = useServerFn(deleteCable);
  const updateFn = useServerFn(updateCable);
  const listTypesFn = useServerFn(listCableTypes);
  const listEpFn = useServerFn(listEndpoints);
  const recomputeFn = useServerFn(recomputeProjectLengths);
  const listPortsFn = useServerFn(listPatchPortsForProject);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Status | "ALL">("ALL");

  const cables = useQuery({
    queryKey: ["cables", projectId],
    queryFn: () => listFn({ data: { projectId } }),
  });
  const types = useQuery({
    queryKey: ["cable-types", projectId],
    queryFn: () => listTypesFn({ data: { projectId } }),
  });
  const eps = useQuery({
    queryKey: ["endpoints", projectId],
    queryFn: () => listEpFn({ data: { projectId } }),
  });
  const ports = useQuery({
    queryKey: ["patch-ports", projectId],
    queryFn: () => listPortsFn({ data: { projectId } }),
  });

  const typeById = useMemo(() => {
    const m = new Map<string, string>();
    (types.data ?? []).forEach((t) => m.set(t.id, t.code));
    return m;
  }, [types.data]);
  const epById = useMemo(() => {
    const m = new Map<string, string>();
    (eps.data ?? []).forEach((e) => m.set(e.id, e.code));
    return m;
  }, [eps.data]);
  const portLabel = useMemo(() => {
    const m = new Map<string, string>();
    (ports.data ?? []).forEach((p) =>
      m.set(p.id, `${p.panel_code}/${String(p.port_number).padStart(2, "0")}`),
    );
    return m;
  }, [ports.data]);

  const filtered = (cables.data ?? []).filter((c) =>
    filter === "ALL" ? true : c.status === filter,
  );

  async function recomputeAll() {
    try {
      const { count } = await recomputeFn({ data: { projectId } });
      toast.success(`Přepočítáno ${count} kabelů`);
      qc.invalidateQueries({ queryKey: ["cables", projectId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  async function remove(id: string) {
    if (!confirm("Smazat kabel?")) return;
    await delFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["cables", projectId] });
  }

  async function setStatus(id: string, status: Status) {
    try {
      await updateFn({ data: { id, status } });
      qc.invalidateQueries({ queryKey: ["cables", projectId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  return (
    <AppShell projectId={projectId}>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Kabelový registr</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Jeden fyzický kabel = jeden řádek. Délky se počítají z trasy a kalibrace.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={recomputeAll}>
            <RefreshCw className="mr-1 h-4 w-4" />
            Přepočítat délky
          </Button>
          <NewCableDialog projectId={projectId} />
        </div>
      </header>

      <div className="mb-3 flex gap-2 text-sm">
        {(["ALL", ...STATUSES] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-sm border px-2 py-1 font-mono text-xs ${
              filter === s
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border text-muted-foreground"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {cables.isLoading ? (
        <div className="text-muted-foreground">Načítám…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Žádné kabely v tomto filtru.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="p-2">Kód</th>
                <th className="p-2">Typ</th>
                <th className="p-2">Od</th>
                <th className="p-2">Do</th>
                <th className="p-2">Stav</th>
                <th className="p-2">Délka (m)</th>
                <th className="p-2 text-right">Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td className="p-2 font-mono">
                    <Link
                      to="/projects/$projectId/cables/$cableId"
                      params={{ projectId, cableId: c.id }}
                      className="hover:underline"
                    >
                      {c.code}
                    </Link>
                  </td>
                  <td className="p-2">{c.cable_type_id ? typeById.get(c.cable_type_id) : "—"}</td>
                  <td className="p-2 font-mono text-xs">
                    {c.from_port_id
                      ? portLabel.get(c.from_port_id) ?? "port"
                      : c.from_endpoint_id
                        ? epById.get(c.from_endpoint_id)
                        : "—"}
                  </td>
                  <td className="p-2 font-mono text-xs">
                    {c.to_port_id
                      ? portLabel.get(c.to_port_id) ?? "port"
                      : c.to_endpoint_id
                        ? epById.get(c.to_endpoint_id)
                        : "—"}
                  </td>
                  <td className="p-2">
                    <select
                      className="rounded-sm border border-input bg-background px-2 py-1 font-mono text-xs"
                      value={c.status}
                      onChange={(e) => setStatus(c.id, e.target.value as Status)}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 font-mono">
                    {c.override_length_m != null ? (
                      <span>
                        {Number(c.override_length_m).toFixed(2)}{" "}
                        <Badge variant="outline" className="ml-1 font-mono text-[9px]">
                          OVERRIDE
                        </Badge>
                      </span>
                    ) : c.computed_length_m != null ? (
                      Number(c.computed_length_m).toFixed(2)
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-2 text-right">
                    <Button variant="ghost" size="icon" onClick={() => remove(c.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}

function NewCableDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [typeId, setTypeId] = useState<string | undefined>();
  const [fromId, setFromId] = useState<string | undefined>();
  const [toId, setToId] = useState<string | undefined>();
  const createFn = useServerFn(createCable);
  const listTypesFn = useServerFn(listCableTypes);
  const listEpFn = useServerFn(listEndpoints);
  const qc = useQueryClient();
  const types = useQuery({
    queryKey: ["cable-types", projectId],
    queryFn: () => listTypesFn({ data: { projectId } }),
    enabled: open,
  });
  const eps = useQuery({
    queryKey: ["endpoints", projectId],
    queryFn: () => listEpFn({ data: { projectId } }),
    enabled: open,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createFn({
        data: {
          projectId,
          code: code.trim(),
          cableTypeId: typeId ?? null,
          fromEndpointId: fromId ?? null,
          toEndpointId: toId ?? null,
        },
      });
      qc.invalidateQueries({ queryKey: ["cables", projectId] });
      setOpen(false);
      setCode("");
      setTypeId(undefined);
      setFromId(undefined);
      setToId(undefined);
      toast.success("Kabel přidán");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1 h-4 w-4" />
          Nový kabel
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nový kabel</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Kód</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
              placeholder="201"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Typ</Label>
            <select
              className="w-full rounded-sm border border-input bg-background px-3 py-1.5 text-sm"
              value={typeId ?? ""}
              onChange={(e) => setTypeId(e.target.value || undefined)}
            >
              <option value="">— vyberte —</option>
              {(types.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.code}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Od</Label>
              <select
                className="w-full rounded-sm border border-input bg-background px-3 py-1.5 text-sm"
                value={fromId ?? ""}
                onChange={(e) => setFromId(e.target.value || undefined)}
              >
                <option value="">—</option>
                {(eps.data ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Do</Label>
              <select
                className="w-full rounded-sm border border-input bg-background px-3 py-1.5 text-sm"
                value={toId ?? ""}
                onChange={(e) => setToId(e.target.value || undefined)}
              >
                <option value="">—</option>
                {(eps.data ?? []).map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.code}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit">Vytvořit</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
