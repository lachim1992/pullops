import { useMemo, useRef, useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

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
import { getFloorPlan, setCalibration } from "@/lib/floorPlans.functions";
import {
  createEndpoint,
  deleteEndpoint,
  listEndpoints,
} from "@/lib/endpoints.functions";
import {
  createRoute,
  deleteRoute,
  getRouteWithPoints,
  listRoutes,
  updateRoute,
  updateRoutePoints,
} from "@/lib/cableRoutes.functions";
import {
  computeCableLength,
  metersPerNormUnit,
  normDistance,
  polylineNormLength,
  type Calibration,
  type NormPoint,
} from "@/lib/length";

export const Route = createFileRoute(
  "/_authenticated/projects/$projectId/plans/$planId",
)({
  head: () => ({
    meta: [{ title: "Editor plánu · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: PlanEditorPage,
});

type Mode = "calibrate" | "endpoint" | "route";

function PlanEditorPage() {
  const { projectId, planId } = useParams({
    from: "/_authenticated/projects/$projectId/plans/$planId",
  });
  const getPlanFn = useServerFn(getFloorPlan);
  const setCalFn = useServerFn(setCalibration);
  const listEpFn = useServerFn(listEndpoints);
  const createEpFn = useServerFn(createEndpoint);
  const deleteEpFn = useServerFn(deleteEndpoint);
  const listRoutesFn = useServerFn(listRoutes);
  const getRouteFn = useServerFn(getRouteWithPoints);
  const createRouteFn = useServerFn(createRoute);
  const updateRouteFn = useServerFn(updateRoute);
  const updateRoutePointsFn = useServerFn(updateRoutePoints);
  const deleteRouteFn = useServerFn(deleteRoute);
  const qc = useQueryClient();

  const plan = useQuery({
    queryKey: ["plan", planId],
    queryFn: () => getPlanFn({ data: { id: planId } }),
  });
  const endpoints = useQuery({
    queryKey: ["endpoints", projectId, planId],
    queryFn: () => listEpFn({ data: { projectId, floorPlanId: planId } }),
  });
  const routes = useQuery({
    queryKey: ["routes", projectId, planId],
    queryFn: () => listRoutesFn({ data: { projectId, floorPlanId: planId } }),
  });

  const [mode, setMode] = useState<Mode>("endpoint");
  const [calA, setCalA] = useState<NormPoint | null>(null);
  const [calB, setCalB] = useState<NormPoint | null>(null);
  const [calDistance, setCalDistance] = useState<string>("");
  const [newEpCode, setNewEpCode] = useState("");
  const [newEpLabel, setNewEpLabel] = useState("");
  const [newEpKind, setNewEpKind] = useState<
    "WORKSTATION" | "AP" | "CAMERA" | "PATCH" | "OTHER"
  >("WORKSTATION");
  const [pendingPos, setPendingPos] = useState<NormPoint | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [draftPoints, setDraftPoints] = useState<NormPoint[]>([]);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const cal = plan.data?.calibration;
  const calibration: Calibration | null = cal
    ? {
        a: { x: Number(cal.point_a_norm_x), y: Number(cal.point_a_norm_y) },
        b: { x: Number(cal.point_b_norm_x), y: Number(cal.point_b_norm_y) },
        real_distance_m: Number(cal.real_distance_m),
      }
    : null;
  const mpu = useMemo(() => metersPerNormUnit(calibration), [calibration]);

  const routeDetail = useQuery({
    queryKey: ["route", selectedRouteId],
    queryFn: () => getRouteFn({ data: { id: selectedRouteId! } }),
    enabled: !!selectedRouteId,
  });

  // sync draft when selected route changes
  const loadedRouteId = routeDetail.data?.route.id ?? null;
  useMemo(() => {
    if (loadedRouteId && loadedRouteId === selectedRouteId) {
      setDraftPoints(
        (routeDetail.data?.points ?? []).map((p) => ({
          x: Number(p.norm_x),
          y: Number(p.norm_y),
        })),
      );
    }
  }, [loadedRouteId, selectedRouteId, routeDetail.data]);

  const draftLengthM = useMemo(() => {
    const res = computeCableLength({
      routePoints: draftPoints,
      manualRouteLengthM: null,
      calibration,
      reserveM: 0,
    });
    return res.meters;
  }, [draftPoints, calibration]);

  function toNorm(evt: React.MouseEvent<SVGSVGElement>): NormPoint | null {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = (evt.clientX - rect.left) / rect.width;
    const y = (evt.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }

  function handleSvgClick(evt: React.MouseEvent<SVGSVGElement>) {
    if (draggingIdx != null) return;
    const pos = toNorm(evt);
    if (!pos) return;
    if (mode === "calibrate") {
      if (!calA) setCalA(pos);
      else if (!calB) setCalB(pos);
      else {
        setCalA(pos);
        setCalB(null);
      }
    } else if (mode === "endpoint") {
      setPendingPos(pos);
    } else if (mode === "route") {
      if (!selectedRouteId) {
        toast.error("Nejprve vyberte nebo vytvořte trasu");
        return;
      }
      setDraftPoints((pts) => [...pts, pos]);
    }
  }

  function handleSvgMove(evt: React.MouseEvent<SVGSVGElement>) {
    if (draggingIdx == null) return;
    const pos = toNorm(evt);
    if (!pos) return;
    setDraftPoints((pts) => pts.map((p, i) => (i === draggingIdx ? pos : p)));
  }

  async function saveCalibration() {
    if (!calA || !calB) return toast.error("Klikněte dva body A a B");
    const dist = Number(calDistance);
    if (!(dist > 0)) return toast.error("Zadejte skutečnou vzdálenost v metrech");
    try {
      await setCalFn({
        data: { floorPlanId: planId, a: calA, b: calB, realDistanceM: dist },
      });
      toast.success("Kalibrace uložena");
      setCalA(null);
      setCalB(null);
      setCalDistance("");
      qc.invalidateQueries({ queryKey: ["plan", planId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  async function saveEndpoint() {
    if (!pendingPos) return;
    if (!newEpCode.trim()) return toast.error("Zadejte kód");
    try {
      await createEpFn({
        data: {
          projectId,
          floorPlanId: planId,
          code: newEpCode.trim(),
          label: newEpLabel.trim() || undefined,
          kind: newEpKind,
          x: pendingPos.x,
          y: pendingPos.y,
        },
      });
      setPendingPos(null);
      setNewEpCode("");
      setNewEpLabel("");
      qc.invalidateQueries({ queryKey: ["endpoints", projectId, planId] });
      toast.success("Endpoint přidán");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  async function removeEndpoint(id: string) {
    if (!confirm("Smazat endpoint?")) return;
    await deleteEpFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["endpoints", projectId, planId] });
  }

  async function saveRoutePoints() {
    if (!selectedRouteId) return;
    try {
      await updateRoutePointsFn({
        data: { routeId: selectedRouteId, points: draftPoints },
      });
      toast.success("Trasa uložena");
      qc.invalidateQueries({ queryKey: ["route", selectedRouteId] });
      qc.invalidateQueries({ queryKey: ["routes", projectId, planId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  async function removeSelectedRoute() {
    if (!selectedRouteId) return;
    if (!confirm("Smazat trasu i její body?")) return;
    await deleteRouteFn({ data: { id: selectedRouteId } });
    setSelectedRouteId(null);
    setDraftPoints([]);
    qc.invalidateQueries({ queryKey: ["routes", projectId, planId] });
  }

  if (plan.isLoading) {
    return (
      <AppShell projectId={projectId}>
        <div className="text-muted-foreground">Načítám…</div>
      </AppShell>
    );
  }

  const currentRoute = routes.data?.find((r) => r.id === selectedRouteId) ?? null;

  return (
    <AppShell projectId={projectId}>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {plan.data?.plan.name}
          </h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            {mpu != null ? (
              <Badge variant="secondary" className="font-mono text-[10px]">
                {mpu.toFixed(2)} m / norm.j.
              </Badge>
            ) : (
              <Badge variant="outline" className="font-mono text-[10px]">
                Chybí kalibrace
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant={mode === "endpoint" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("endpoint")}
          >
            Endpointy
          </Button>
          <Button
            variant={mode === "route" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("route")}
          >
            Trasy
          </Button>
          <Button
            variant={mode === "calibrate" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("calibrate")}
          >
            Kalibrace
          </Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-sm border border-border bg-muted">
          {plan.data?.documentUrl ? (
            <img
              src={plan.data.documentUrl}
              alt={plan.data.plan.name}
              className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Bez podkladového obrázku — pracujte v prázdném prostoru
            </div>
          )}
          <svg
            ref={svgRef}
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full cursor-crosshair"
            onClick={handleSvgClick}
            onMouseMove={handleSvgMove}
            onMouseUp={() => setDraggingIdx(null)}
            onMouseLeave={() => setDraggingIdx(null)}
          >
            {calibration && (
              <>
                <line
                  x1={calibration.a.x}
                  y1={calibration.a.y}
                  x2={calibration.b.x}
                  y2={calibration.b.y}
                  stroke="hsl(var(--accent))"
                  strokeWidth={0.003}
                />
                <circle cx={calibration.a.x} cy={calibration.a.y} r={0.008} fill="hsl(var(--accent))" />
                <circle cx={calibration.b.x} cy={calibration.b.y} r={0.008} fill="hsl(var(--accent))" />
              </>
            )}
            {mode === "calibrate" && calA && (
              <circle cx={calA.x} cy={calA.y} r={0.01} fill="hsl(var(--primary))" />
            )}
            {mode === "calibrate" && calB && (
              <circle cx={calB.x} cy={calB.y} r={0.01} fill="hsl(var(--primary))" />
            )}
            {mode === "calibrate" && calA && calB && (
              <line
                x1={calA.x}
                y1={calA.y}
                x2={calB.x}
                y2={calB.y}
                stroke="hsl(var(--primary))"
                strokeWidth={0.003}
                strokeDasharray="0.01 0.005"
              />
            )}
            {(endpoints.data ?? []).map((ep) => (
              <g key={ep.id}>
                <circle
                  cx={Number(ep.norm_x)}
                  cy={Number(ep.norm_y)}
                  r={0.01}
                  fill={
                    mode === "route" &&
                    (ep.id === currentRoute?.from_endpoint_id ||
                      ep.id === currentRoute?.to_endpoint_id)
                      ? "hsl(var(--accent))"
                      : "hsl(var(--primary))"
                  }
                  stroke="white"
                  strokeWidth={0.002}
                />
              </g>
            ))}
            {mode === "route" && draftPoints.length > 1 && (
              <polyline
                points={draftPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="hsl(var(--destructive))"
                strokeWidth={0.004}
                strokeLinejoin="round"
              />
            )}
            {mode === "route" &&
              draftPoints.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={0.012}
                  fill="hsl(var(--destructive))"
                  stroke="white"
                  strokeWidth={0.002}
                  style={{ cursor: "grab" }}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setDraggingIdx(i);
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setDraftPoints((pts) => pts.filter((_, j) => j !== i));
                  }}
                />
              ))}
            {pendingPos && mode === "endpoint" && (
              <circle
                cx={pendingPos.x}
                cy={pendingPos.y}
                r={0.012}
                fill="none"
                stroke="hsl(var(--destructive))"
                strokeWidth={0.003}
              />
            )}
          </svg>
        </div>

        <aside className="space-y-4">
          {mode === "calibrate" && (
            <div className="rounded-sm border border-border p-3 text-sm">
              <div className="mb-2 font-semibold">Kalibrace</div>
              <div className="mb-2 text-xs text-muted-foreground">
                Klikněte na dva referenční body v plánu (A, B).
              </div>
              <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                <div>A: {calA ? `${calA.x.toFixed(3)}, ${calA.y.toFixed(3)}` : "—"}</div>
                <div>B: {calB ? `${calB.x.toFixed(3)}, ${calB.y.toFixed(3)}` : "—"}</div>
              </div>
              <div className="mt-3 space-y-1.5">
                <Label>Skutečná vzdálenost A→B (m)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={calDistance}
                  onChange={(e) => setCalDistance(e.target.value)}
                />
              </div>
              {calA && calB && (
                <div className="mt-2 text-xs text-muted-foreground">
                  Normalizovaná vzdálenost:{" "}
                  <span className="font-mono">{normDistance(calA, calB).toFixed(4)}</span>
                </div>
              )}
              <Button size="sm" className="mt-3 w-full" onClick={saveCalibration}>
                Uložit kalibraci
              </Button>
            </div>
          )}

          {mode === "endpoint" && (
            <div className="rounded-sm border border-border p-3 text-sm">
              <div className="mb-2 font-semibold">Nový endpoint</div>
              {!pendingPos ? (
                <div className="text-xs text-muted-foreground">
                  Klikněte do plánu pro umístění.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="space-y-1.5">
                    <Label>Kód</Label>
                    <Input
                      value={newEpCode}
                      onChange={(e) => setNewEpCode(e.target.value)}
                      placeholder="např. 201"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Popis</Label>
                    <Input
                      value={newEpLabel}
                      onChange={(e) => setNewEpLabel(e.target.value)}
                      placeholder="např. CSO01"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Typ</Label>
                    <select
                      className="w-full rounded-sm border border-input bg-background px-3 py-1.5 text-sm"
                      value={newEpKind}
                      onChange={(e) => setNewEpKind(e.target.value as typeof newEpKind)}
                    >
                      <option value="WORKSTATION">Zásuvka</option>
                      <option value="AP">AP</option>
                      <option value="CAMERA">Kamera</option>
                      <option value="PATCH">Patch</option>
                      <option value="OTHER">Jiné</option>
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={saveEndpoint}>
                      Uložit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setPendingPos(null)}
                    >
                      Zrušit
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === "route" && (
            <div className="rounded-sm border border-border p-3 text-sm">
              <div className="mb-2 flex items-center justify-between">
                <div className="font-semibold">Trasa</div>
                <NewRouteDialog
                  projectId={projectId}
                  floorPlanId={planId}
                  endpoints={endpoints.data ?? []}
                  onCreated={async (id) => {
                    await qc.invalidateQueries({ queryKey: ["routes", projectId, planId] });
                    setSelectedRouteId(id);
                    setDraftPoints([]);
                  }}
                  createFn={async (input) => {
                    const r = await createRouteFn({ data: input });
                    return r.id;
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Vybraná trasa</Label>
                <select
                  className="w-full rounded-sm border border-input bg-background px-3 py-1.5 font-mono text-xs"
                  value={selectedRouteId ?? ""}
                  onChange={(e) => setSelectedRouteId(e.target.value || null)}
                >
                  <option value="">— vyberte —</option>
                  {(routes.data ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name ?? r.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
              {selectedRouteId && (
                <>
                  <div className="mt-3 space-y-2 rounded-sm bg-muted/40 p-2 font-mono text-xs">
                    <div>Bodů: {draftPoints.length}</div>
                    <div>
                      Norm. délka:{" "}
                      {polylineNormLength(draftPoints).toFixed(4)}
                    </div>
                    <div>
                      Metrů:{" "}
                      {draftLengthM != null
                        ? `${draftLengthM.toFixed(2)} m`
                        : mpu == null
                          ? "chybí kalibrace"
                          : "—"}
                    </div>
                  </div>
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    Klik = přidat bod · Táhnout = přemístit · Dvojklik = smazat bod
                  </div>
                  <RouteEndpointsForm
                    routeId={selectedRouteId}
                    fromId={currentRoute?.from_endpoint_id ?? null}
                    toId={currentRoute?.to_endpoint_id ?? null}
                    endpoints={endpoints.data ?? []}
                    onSaved={() =>
                      qc.invalidateQueries({ queryKey: ["routes", projectId, planId] })
                    }
                    updateFn={async (input) => {
                      await updateRouteFn({ data: input });
                    }}
                  />
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" className="flex-1" onClick={saveRoutePoints}>
                      Uložit body
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDraftPoints((pts) => pts.slice(0, -1))}
                    >
                      Zpět
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDraftPoints([])}
                    >
                      Vymazat
                    </Button>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-2 w-full text-destructive"
                    onClick={removeSelectedRoute}
                  >
                    Smazat trasu
                  </Button>
                </>
              )}
            </div>
          )}

          <div className="rounded-sm border border-border">
            <div className="border-b border-border p-3 text-sm font-semibold">
              Endpointy na plánu ({endpoints.data?.length ?? 0})
            </div>
            <div className="max-h-96 divide-y divide-border overflow-y-auto text-sm">
              {(endpoints.data ?? []).map((ep) => (
                <div key={ep.id} className="flex items-center gap-2 p-2">
                  <div className="flex-1">
                    <div className="font-mono text-xs">{ep.code}</div>
                    <div className="text-xs text-muted-foreground">
                      {ep.label ?? ep.endpoint_kind}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeEndpoint(ep.id)}
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

function NewRouteDialog({
  projectId,
  floorPlanId,
  endpoints,
  onCreated,
  createFn,
}: {
  projectId: string;
  floorPlanId: string;
  endpoints: Array<{ id: string; code: string }>;
  onCreated: (id: string) => void | Promise<void>;
  createFn: (input: {
    projectId: string;
    floorPlanId: string;
    name?: string;
    fromEndpointId?: string | null;
    toEndpointId?: string | null;
  }) => Promise<string>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const id = await createFn({
        projectId,
        floorPlanId,
        name: name.trim() || undefined,
        fromEndpointId: fromId || null,
        toEndpointId: toId || null,
      });
      toast.success("Trasa vytvořena");
      await onCreated(id);
      setOpen(false);
      setName("");
      setFromId("");
      setToId("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          + Nová
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nová trasa</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Název</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="např. 201-CSO01" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Od</Label>
              <select
                className="w-full rounded-sm border border-input bg-background px-3 py-1.5 text-sm"
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
              >
                <option value="">—</option>
                {endpoints.map((ep) => (
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
                {endpoints.map((ep) => (
                  <option key={ep.id} value={ep.id}>
                    {ep.code}
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

function RouteEndpointsForm({
  routeId,
  fromId,
  toId,
  endpoints,
  onSaved,
  updateFn,
}: {
  routeId: string;
  fromId: string | null;
  toId: string | null;
  endpoints: Array<{ id: string; code: string }>;
  onSaved: () => void;
  updateFn: (input: {
    id: string;
    fromEndpointId?: string | null;
    toEndpointId?: string | null;
  }) => Promise<void>;
}) {
  const [f, setF] = useState(fromId ?? "");
  const [t, setT] = useState(toId ?? "");
  // sync when route changes
  useMemo(() => {
    setF(fromId ?? "");
    setT(toId ?? "");
  }, [routeId, fromId, toId]);

  async function save() {
    try {
      await updateFn({
        id: routeId,
        fromEndpointId: f || null,
        toEndpointId: t || null,
      });
      toast.success("Endpointy trasy uloženy");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Od</Label>
          <select
            className="w-full rounded-sm border border-input bg-background px-2 py-1 text-xs"
            value={f}
            onChange={(e) => setF(e.target.value)}
          >
            <option value="">—</option>
            {endpoints.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.code}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Do</Label>
          <select
            className="w-full rounded-sm border border-input bg-background px-2 py-1 text-xs"
            value={t}
            onChange={(e) => setT(e.target.value)}
          >
            <option value="">—</option>
            {endpoints.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.code}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Button size="sm" variant="outline" className="w-full" onClick={save}>
        Uložit endpointy trasy
      </Button>
    </div>
  );
}
