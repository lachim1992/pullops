import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  getCable,
  recomputeCableLength,
  updateCable,
} from "@/lib/cables.functions";
import { listCableTypes } from "@/lib/cableTypes.functions";
import { listEndpoints } from "@/lib/endpoints.functions";
import { listRoutes } from "@/lib/cableRoutes.functions";
import { listEntityAuditEvents } from "@/lib/audit.functions";

const STATUSES = ["PLANNED", "PULLED", "TERMINATED", "TESTED", "CANCELLED"] as const;
type Status = (typeof STATUSES)[number];

export const Route = createFileRoute(
  "/_authenticated/projects/$projectId/cables/$cableId",
)({
  head: () => ({
    meta: [{ title: "Detail kabelu · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: CableDetailPage,
});

function CableDetailPage() {
  const { projectId, cableId } = useParams({
    from: "/_authenticated/projects/$projectId/cables/$cableId",
  });
  const getFn = useServerFn(getCable);
  const updateFn = useServerFn(updateCable);
  const recomputeFn = useServerFn(recomputeCableLength);
  const listTypesFn = useServerFn(listCableTypes);
  const listEpFn = useServerFn(listEndpoints);
  const listRoutesFn = useServerFn(listRoutes);
  const listAuditFn = useServerFn(listEntityAuditEvents);
  const qc = useQueryClient();

  const cable = useQuery({
    queryKey: ["cable", cableId],
    queryFn: () => getFn({ data: { id: cableId } }),
  });
  const types = useQuery({
    queryKey: ["cable-types", projectId],
    queryFn: () => listTypesFn({ data: { projectId } }),
  });
  const eps = useQuery({
    queryKey: ["endpoints", projectId],
    queryFn: () => listEpFn({ data: { projectId } }),
  });
  const routes = useQuery({
    queryKey: ["routes", projectId],
    queryFn: () => listRoutesFn({ data: { projectId } }),
  });
  const audit = useQuery({
    queryKey: ["audit", cableId],
    queryFn: () => listAuditFn({ data: { entityId: cableId } }),
  });

  const [code, setCode] = useState("");
  const [status, setStatus] = useState<Status>("PLANNED");
  const [typeId, setTypeId] = useState<string>("");
  const [routeId, setRouteId] = useState<string>("");
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");
  const [overrideM, setOverrideM] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const c = cable.data;
    if (!c) return;
    setCode(c.code ?? "");
    setStatus((c.status ?? "PLANNED") as Status);
    setTypeId(c.cable_type_id ?? "");
    setRouteId(c.route_id ?? "");
    setFromId(c.from_endpoint_id ?? "");
    setToId(c.to_endpoint_id ?? "");
    setOverrideM(c.override_length_m != null ? String(c.override_length_m) : "");
    setNotes(c.notes ?? "");
  }, [cable.data]);

  const typeById = useMemo(() => {
    const m = new Map<string, { code: string; reserve: number }>();
    (types.data ?? []).forEach((t) =>
      m.set(t.id, { code: t.code, reserve: Number(t.default_reserve_m ?? 0) }),
    );
    return m;
  }, [types.data]);

  const effective = useMemo(() => {
    const c = cable.data;
    if (!c) return null;
    if (c.override_length_m != null) return { value: Number(c.override_length_m), source: "override" };
    if (c.computed_length_m != null) return { value: Number(c.computed_length_m), source: "computed" };
    return null;
  }, [cable.data]);

  async function save() {
    setSaving(true);
    try {
      const overrideNum = overrideM.trim() === "" ? null : Number(overrideM);
      if (overrideNum != null && !(overrideNum >= 0)) {
        setSaving(false);
        return toast.error("Override délky musí být ≥ 0");
      }
      await updateFn({
        data: {
          id: cableId,
          code: code.trim() || undefined,
          status,
          cableTypeId: typeId || null,
          routeId: routeId || null,
          fromEndpointId: fromId || null,
          toEndpointId: toId || null,
          overrideLengthM: overrideNum,
          notes: notes.trim() ? notes.trim() : null,
        },
      });
      toast.success("Uloženo");
      await qc.invalidateQueries({ queryKey: ["cable", cableId] });
      await qc.invalidateQueries({ queryKey: ["cables", projectId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    } finally {
      setSaving(false);
    }
  }

  async function recompute() {
    try {
      const { meters } = await recomputeFn({ data: { cableId } });
      if (meters == null) {
        toast.warning("Délku nelze spočítat — chybí trasa nebo kalibrace");
      } else {
        toast.success(`Nová délka: ${meters.toFixed(2)} m`);
      }
      await qc.invalidateQueries({ queryKey: ["cable", cableId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  if (cable.isLoading) {
    return (
      <AppShell projectId={projectId}>
        <div className="text-muted-foreground">Načítám…</div>
      </AppShell>
    );
  }

  if (!cable.data) {
    return (
      <AppShell projectId={projectId}>
        <div className="text-muted-foreground">Kabel nenalezen.</div>
      </AppShell>
    );
  }

  const c = cable.data;
  const reserve = c.cable_type_id ? (typeById.get(c.cable_type_id)?.reserve ?? 0) : 0;

  return (
    <AppShell projectId={projectId}>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/projects/$projectId/cables" params={{ projectId }}>
              <ArrowLeft className="mr-1 h-4 w-4" /> Zpět
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight font-mono">
            {c.code}
          </h1>
          <Badge variant="secondary" className="font-mono text-[10px]">
            {c.status}
          </Badge>
        </div>
        <Button variant="outline" size="sm" onClick={recompute}>
          <RefreshCw className="mr-1 h-4 w-4" /> Přepočítat délku
        </Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="space-y-4">
          <div className="rounded-sm border border-border p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Základ
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Kód</Label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Stav</Label>
                <select
                  className="w-full rounded-sm border border-input bg-background px-3 py-1.5 text-sm"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Status)}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Typ kabelu</Label>
                <select
                  className="w-full rounded-sm border border-input bg-background px-3 py-1.5 text-sm"
                  value={typeId}
                  onChange={(e) => setTypeId(e.target.value)}
                >
                  <option value="">—</option>
                  {(types.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.code} · {Number(t.default_reserve_m ?? 0).toFixed(1)} m rezerva
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Trasa</Label>
                <select
                  className="w-full rounded-sm border border-input bg-background px-3 py-1.5 text-sm"
                  value={routeId}
                  onChange={(e) => setRouteId(e.target.value)}
                >
                  <option value="">—</option>
                  {(routes.data ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name ?? r.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Od</Label>
                <select
                  className="w-full rounded-sm border border-input bg-background px-3 py-1.5 text-sm"
                  value={fromId}
                  onChange={(e) => setFromId(e.target.value)}
                >
                  <option value="">—</option>
                  {(eps.data ?? []).map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.code}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Do</Label>
                <select
                  className="w-full rounded-sm border border-input bg-background px-3 py-1.5 text-sm"
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
                >
                  <option value="">—</option>
                  {(eps.data ?? []).map((ep) => (
                    <option key={ep.id} value={ep.id}>
                      {ep.code}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="rounded-sm border border-border p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Poznámky
            </h2>
            <textarea
              className="w-full rounded-sm border border-input bg-background px-3 py-2 text-sm"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Poznámky k tomuto kabelu"
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? "Ukládám…" : "Uložit změny"}
            </Button>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-sm border border-border p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Délka
            </h2>
            <div className="space-y-2 font-mono text-sm">
              <Row
                label="computed"
                value={c.computed_length_m != null ? `${Number(c.computed_length_m).toFixed(2)} m` : "—"}
              />
              <Row
                label="rezerva typu"
                value={reserve > 0 ? `2 × ${reserve.toFixed(1)} m` : "—"}
              />
              <div className="space-y-1.5">
                <Label className="text-xs">Override (m)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={overrideM}
                  onChange={(e) => setOverrideM(e.target.value)}
                  placeholder="prázdné = bez override"
                />
              </div>
              <div className="mt-3 border-t border-border pt-2">
                <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  Efektivní
                </div>
                <div className="text-lg font-semibold">
                  {effective ? `${effective.value.toFixed(2)} m` : "—"}
                </div>
                {effective && (
                  <Badge variant="outline" className="mt-1 font-mono text-[10px]">
                    {effective.source}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-sm border border-border">
            <div className="border-b border-border p-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Historie
            </div>
            <div className="max-h-96 divide-y divide-border overflow-y-auto">
              {(audit.data ?? []).length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground">Žádné události.</div>
              ) : (
                (audit.data ?? []).map((ev) => (
                  <div key={ev.id} className="p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="font-mono text-[9px]">
                        {ev.action}
                      </Badge>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {new Date(ev.created_at).toLocaleString("cs-CZ")}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
