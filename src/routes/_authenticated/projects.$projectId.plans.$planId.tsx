import { useEffect, useMemo, useRef, useState } from "react";
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
import { getFloorPlan, setCalibration, updateFloorPlan } from "@/lib/floorPlans.functions";
import { listProjectDocuments } from "@/lib/documents.functions";

import {
  createEndpoint,
  deleteEndpoint,
  listEndpoints,
  updateEndpoint,
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
  addCablesToEndpoint,
  assignRouteToEndpointCables,
  listEndpointCables,
  listUnassignedCables,
  removeCableFromEndpoint,
} from "@/lib/endpointGroups.functions";
import { createRack, listRacks, deleteRack, updateRack } from "@/lib/racks.functions";
import { createBundle, listBundles, deleteBundle, updateBundle } from "@/lib/cableBundles.functions";
import {
  autoAssignBundlesForPlan,
  createCableFromPort,
  listFreePorts,
  listPlanBranches,
} from "@/lib/cablesFromPort.functions";
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

type Mode = "calibrate" | "endpoint" | "route" | "rack" | "bundle" | "port";

function PlanEditorPage() {
  const { projectId, planId } = useParams({
    from: "/_authenticated/projects/$projectId/plans/$planId",
  });
  const getPlanFn = useServerFn(getFloorPlan);
  const setCalFn = useServerFn(setCalibration);
  const updatePlanFn = useServerFn(updateFloorPlan);
  const listEpFn = useServerFn(listEndpoints);
  const createEpFn = useServerFn(createEndpoint);
  const deleteEpFn = useServerFn(deleteEndpoint);
  const listRoutesFn = useServerFn(listRoutes);
  const getRouteFn = useServerFn(getRouteWithPoints);
  const createRouteFn = useServerFn(createRoute);
  const updateRouteFn = useServerFn(updateRoute);
  const updateRoutePointsFn = useServerFn(updateRoutePoints);
  const deleteRouteFn = useServerFn(deleteRoute);
  const listDocsFn = useServerFn(listProjectDocuments);
  const listEpCablesFn = useServerFn(listEndpointCables);
  const listUnassignedFn = useServerFn(listUnassignedCables);
  const addCablesFn = useServerFn(addCablesToEndpoint);
  const removeCableFn = useServerFn(removeCableFromEndpoint);
  const assignRouteFn = useServerFn(assignRouteToEndpointCables);
  const listRacksFn = useServerFn(listRacks);
  const createRackFn = useServerFn(createRack);
  const deleteRackFn = useServerFn(deleteRack);
  const updateRackFn = useServerFn(updateRack);
  const updateEndpointFn = useServerFn(updateEndpoint);
  const updateBundleFn = useServerFn(updateBundle);
  const listBundlesFn = useServerFn(listBundles);
  const createBundleFn = useServerFn(createBundle);
  const deleteBundleFn = useServerFn(deleteBundle);
  const listFreePortsFn = useServerFn(listFreePorts);
  const createCableFromPortFn = useServerFn(createCableFromPort);
  const listPlanBranchesFn = useServerFn(listPlanBranches);
  const autoAssignBundlesFn = useServerFn(autoAssignBundlesForPlan);
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
  const docs = useQuery({
    queryKey: ["docs", projectId],
    queryFn: () => listDocsFn({ data: { projectId } }),
  });
  const racks = useQuery({
    queryKey: ["racks", projectId, planId],
    queryFn: () => listRacksFn({ data: { projectId, floorPlanId: planId } }),
  });
  const bundles = useQuery({
    queryKey: ["bundles", projectId, planId],
    queryFn: () => listBundlesFn({ data: { projectId, floorPlanId: planId } }),
  });
  const freePorts = useQuery({
    queryKey: ["free-ports", projectId],
    queryFn: () => listFreePortsFn({ data: { projectId } }),
  });
  const branches = useQuery({
    queryKey: ["plan-branches", projectId, planId],
    queryFn: () => listPlanBranchesFn({ data: { projectId, floorPlanId: planId } }),
  });

  async function changeBackgroundDoc(documentId: string | null) {
    try {
      await updatePlanFn({ data: { id: planId, documentId } });
      toast.success("Podklad plánu aktualizován");
      qc.invalidateQueries({ queryKey: ["plan", planId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }


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
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(null);
  const [draftPoints, setDraftPoints] = useState<NormPoint[]>([]);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  type DragTarget =
    | { kind: "endpoint"; id: string }
    | { kind: "rack"; id: string }
    | { kind: "bundle"; id: string; idx: number };
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
  const [dragPos, setDragPos] = useState<NormPoint | null>(null);
  const dragMovedRef = useRef(false);
  // Rack mode
  const [pendingRackPos, setPendingRackPos] = useState<NormPoint | null>(null);
  const [newRackCode, setNewRackCode] = useState("");
  const [newRackName, setNewRackName] = useState("");
  // Bundle mode
  const [draftBundlePoints, setDraftBundlePoints] = useState<NormPoint[]>([]);
  const [newBundleCode, setNewBundleCode] = useState("");
  // Port mode
  const [selectedPortId, setSelectedPortId] = useState<string | null>(null);
  const [pendingPortPos, setPendingPortPos] = useState<NormPoint | null>(null);
  const [newPortEpCode, setNewPortEpCode] = useState("");
  const [newPortCableCode, setNewPortCableCode] = useState("");
  const svgRef = useRef<SVGSVGElement>(null);

  // Zoom & pan state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const panStateRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(
    null,
  );

  function clampZoom(z: number) {
    return Math.max(0.5, Math.min(8, z));
  }
  function zoomAt(clientX: number, clientY: number, factor: number) {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    setZoom((z) => {
      const nz = clampZoom(z * factor);
      const real = nz / z;
      setPan((p) => ({ x: px - (px - p.x) * real, y: py - (py - p.y) * real }));
      return nz;
    });
  }
  function handleWheel(e: React.WheelEvent) {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 1) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    zoomAt(e.clientX, e.clientY, factor);
  }
  function handleViewportMouseDown(e: React.MouseEvent) {
    // middle mouse or space+left, or right button → pan
    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) {
      e.preventDefault();
      panStateRef.current = { startX: e.clientX, startY: e.clientY, ox: pan.x, oy: pan.y };
    }
  }
  function handleViewportMouseMove(e: React.MouseEvent) {
    const st = panStateRef.current;
    if (!st) return;
    setPan({ x: st.ox + (e.clientX - st.startX), y: st.oy + (e.clientY - st.startY) });
  }
  function endPan() {
    panStateRef.current = null;
  }
  function resetView() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  const endpointCables = useQuery({
    queryKey: ["endpoint-cables", selectedEndpointId],
    queryFn: () => listEpCablesFn({ data: { endpointId: selectedEndpointId! } }),
    enabled: !!selectedEndpointId,
  });

  const cal = plan.data?.calibration;
  const calibration: Calibration | null = cal
    ? {
        a: { x: Number(cal.point_a_norm_x), y: Number(cal.point_a_norm_y) },
        b: { x: Number(cal.point_b_norm_x), y: Number(cal.point_b_norm_y) },
        real_distance_m: Number(cal.real_distance_m),
      }
    : null;
  const mpu = useMemo(() => metersPerNormUnit(calibration), [calibration]);
  const calNormDist = useMemo(
    () => (calibration ? normDistance(calibration.a, calibration.b) : 0),
    [calibration],
  );
  const calibrationSuspicious = calibration != null && calNormDist < 0.05;

  async function autoAssign() {
    try {
      const res = await autoAssignBundlesFn({
        data: { projectId, floorPlanId: planId },
      });
      if (res.reason === "no_bundles") {
        toast.error("Není žádný kmen — nakreslete kmen v režimu 'Kmeny'");
      } else if (res.reason === "no_endpoints") {
        toast.error("Na tomto plánu nejsou žádné endpointy");
      } else {
        toast.success(`Přiřazeno ${res.assigned} kabelů k nejbližšímu kmeni`);
      }
      qc.invalidateQueries({ queryKey: ["plan-branches", projectId, planId] });
      qc.invalidateQueries({ queryKey: ["cables", projectId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

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
    if (dragTarget != null) return;
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
    } else if (mode === "rack") {
      setPendingRackPos(pos);
    } else if (mode === "bundle") {
      setDraftBundlePoints((pts) => [...pts, pos]);
    } else if (mode === "port") {
      if (!selectedPortId) {
        toast.error("Nejprve vyberte volný port ze seznamu");
        return;
      }
      setPendingPortPos(pos);
    }
  }

  function handleSvgMove(evt: React.MouseEvent<SVGSVGElement>) {
    if (dragTarget != null) {
      const pos = toNorm(evt);
      if (!pos) return;
      dragMovedRef.current = true;
      setDragPos(pos);
      return;
    }
    if (draggingIdx == null) return;
    const pos = toNorm(evt);
    if (!pos) return;
    setDraftPoints((pts) => pts.map((p, i) => (i === draggingIdx ? pos : p)));
  }

  async function commitDrag() {
    const target = dragTarget;
    const pos = dragPos;
    setDragTarget(null);
    setDragPos(null);
    if (!target || !pos || !dragMovedRef.current) {
      dragMovedRef.current = false;
      return;
    }
    dragMovedRef.current = false;
    try {
      if (target.kind === "endpoint") {
        await updateEndpointFn({ data: { id: target.id, x: pos.x, y: pos.y } });
        qc.invalidateQueries({ queryKey: ["endpoints", projectId, planId] });
      } else if (target.kind === "rack") {
        await updateRackFn({ data: { id: target.id, x: pos.x, y: pos.y } });
        qc.invalidateQueries({ queryKey: ["racks", projectId, planId] });
      } else if (target.kind === "bundle") {
        const b = (bundles.data ?? []).find((x) => x.id === target.id);
        if (!b) return;
        const pts = ((b.points as unknown as NormPoint[]) ?? []).map((p, i) =>
          i === target.idx ? pos : p,
        );
        await updateBundleFn({ data: { id: target.id, points: pts } });
        qc.invalidateQueries({ queryKey: ["bundles", projectId, planId] });
      }
      // recompute branch trasy pro tento plán
      await autoAssignBundlesFn({
        data: { projectId, floorPlanId: planId, overwrite: true },
      });
      qc.invalidateQueries({ queryKey: ["plan-branches", projectId, planId] });
      qc.invalidateQueries({ queryKey: ["cables", projectId] });
      toast.success("Přesunuto");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
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

  async function saveRack() {
    if (!pendingRackPos) return;
    if (!newRackCode.trim()) return toast.error("Zadejte kód racku");
    try {
      await createRackFn({
        data: {
          projectId,
          floorPlanId: planId,
          code: newRackCode.trim(),
          name: newRackName.trim() || undefined,
          x: pendingRackPos.x,
          y: pendingRackPos.y,
        },
      });
      setPendingRackPos(null);
      setNewRackCode("");
      setNewRackName("");
      qc.invalidateQueries({ queryKey: ["racks", projectId, planId] });
      toast.success("Rack přidán");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }
  async function removeRack(id: string) {
    if (!confirm("Smazat rack? Panely ztratí vazbu.")) return;
    try {
      await deleteRackFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["racks", projectId, planId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }
  async function saveBundle() {
    if (draftBundlePoints.length < 2) return toast.error("Alespoň 2 body");
    if (!newBundleCode.trim()) return toast.error("Zadejte kód kmenu");
    try {
      await createBundleFn({
        data: {
          projectId,
          floorPlanId: planId,
          code: newBundleCode.trim(),
          points: draftBundlePoints,
        },
      });
      setDraftBundlePoints([]);
      setNewBundleCode("");
      qc.invalidateQueries({ queryKey: ["bundles", projectId, planId] });
      toast.success("Kmen uložen");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }
  async function removeBundle(id: string) {
    if (!confirm("Smazat kmen?")) return;
    try {
      await deleteBundleFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["bundles", projectId, planId] });
      qc.invalidateQueries({ queryKey: ["cables", projectId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }
  async function savePortCable() {
    if (!pendingPortPos || !selectedPortId) return;
    if (!newPortEpCode.trim() || !newPortCableCode.trim())
      return toast.error("Vyplňte kód endpointu i kabelu");
    try {
      await createCableFromPortFn({
        data: {
          projectId,
          floorPlanId: planId,
          portId: selectedPortId,
          cableCode: newPortCableCode.trim(),
          endpoint: {
            code: newPortEpCode.trim(),
            kind: "WORKSTATION",
            x: pendingPortPos.x,
            y: pendingPortPos.y,
          },
        },
      });
      setPendingPortPos(null);
      setSelectedPortId(null);
      setNewPortEpCode("");
      setNewPortCableCode("");
      qc.invalidateQueries({ queryKey: ["endpoints", projectId, planId] });
      qc.invalidateQueries({ queryKey: ["free-ports", projectId] });
      qc.invalidateQueries({ queryKey: ["cables", projectId] });
      qc.invalidateQueries({ queryKey: ["plan-branches", projectId, planId] });
      toast.success("Endpoint a kabel vytvořeny, trasa přiřazena k nejbližšímu kmeni");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
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
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {mpu != null ? (
              <Badge
                variant={calibrationSuspicious ? "destructive" : "secondary"}
                className="font-mono text-[10px]"
              >
                {mpu.toFixed(2)} m / norm.j.
              </Badge>
            ) : (
              <Badge variant="outline" className="font-mono text-[10px]">
                Chybí kalibrace
              </Badge>
            )}
            {calibrationSuspicious && (
              <span className="font-mono text-[10px] text-destructive">
                Body A/B jsou příliš blízko sebe ({calNormDist.toFixed(4)}) — překalibrujte
              </span>
            )}
            <Button size="sm" variant="outline" className="h-6 px-2 text-[10px]" onClick={autoAssign}>
              Přiřadit kabely k nejbližšímu kmeni
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={mode === "endpoint" ? "default" : "outline"} size="sm" onClick={() => setMode("endpoint")}>Endpointy</Button>
          <Button variant={mode === "rack" ? "default" : "outline"} size="sm" onClick={() => setMode("rack")}>Racky</Button>
          <Button variant={mode === "bundle" ? "default" : "outline"} size="sm" onClick={() => setMode("bundle")}>Kmeny</Button>
          <Button variant={mode === "port" ? "default" : "outline"} size="sm" onClick={() => setMode("port")}>Trasy</Button>
          <Button variant={mode === "calibrate" ? "default" : "outline"} size="sm" onClick={() => setMode("calibrate")}>Kalibrace</Button>
        </div>
      </header>


      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div
          ref={viewportRef}
          className="relative h-[calc(100vh-220px)] min-h-[560px] w-full overflow-hidden rounded-sm border border-border bg-muted"
          onWheel={handleWheel}
          onMouseDown={handleViewportMouseDown}
          onMouseMove={handleViewportMouseMove}
          onMouseUp={endPan}
          onMouseLeave={endPan}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Zoom controls */}
          <div className="absolute right-2 top-2 z-10 flex flex-col gap-1 rounded-sm border border-border bg-background/95 p-1 shadow-sm">
            <Button
              size="sm"
              variant="outline"
              className="h-7 w-7 p-0 font-mono"
              onClick={() => {
                const r = viewportRef.current?.getBoundingClientRect();
                if (r) zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1.25);
              }}
              title="Přiblížit"
            >
              +
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 w-7 p-0 font-mono"
              onClick={() => {
                const r = viewportRef.current?.getBoundingClientRect();
                if (r) zoomAt(r.left + r.width / 2, r.top + r.height / 2, 1 / 1.25);
              }}
              title="Oddálit"
            >
              −
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 w-7 p-0 font-mono text-[10px]"
              onClick={resetView}
              title="Resetovat pohled"
            >
              1:1
            </Button>
            <div className="mt-1 text-center font-mono text-[10px] text-muted-foreground">
              {Math.round(zoom * 100)}%
            </div>
          </div>
          <div className="absolute left-2 top-2 z-10 rounded-sm bg-background/80 px-2 py-1 font-mono text-[10px] text-muted-foreground">
            Kolečko = zoom · Alt/prostřední tlač. = posun
          </div>

          <div
            className="absolute left-0 top-0 h-full w-full origin-top-left"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          >
            {plan.data?.documentUrl ? (
              plan.data.document?.mime_type?.includes("pdf") ? (
                <PdfPlanBackground url={plan.data.documentUrl} title={plan.data.plan.name} />
              ) : (
                <img
                  src={plan.data.documentUrl}
                  alt={plan.data.plan.name}
                  className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
                />
              )
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                Bez podkladového obrázku — vyberte podklad vpravo
              </div>
            )}

            <svg
              ref={svgRef}
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full cursor-crosshair"
              onClick={handleSvgClick}
              onMouseMove={handleSvgMove}
              onMouseUp={() => { setDraggingIdx(null); void commitDrag(); }}
              onMouseLeave={() => { setDraggingIdx(null); void commitDrag(); }}
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
              {/* Bundles (kmeny) */}
              {(bundles.data ?? []).map((b) => {
                const rawPts = (b.points as unknown as NormPoint[]) ?? [];
                if (rawPts.length < 2) return null;
                const pts = rawPts.map((p, i) =>
                  dragTarget && dragTarget.kind === "bundle" && dragTarget.id === b.id && dragTarget.idx === i && dragPos
                    ? dragPos
                    : p,
                );
                return (
                  <g key={b.id}>
                    <polyline
                      points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeOpacity={0.9}
                      strokeWidth={0.014 / zoom}
                      strokeLinejoin="round"
                    />
                    {pts.map((p, i) => (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={0.008 / zoom}
                        fill="hsl(var(--primary))"
                        stroke="white"
                        strokeWidth={0.002 / zoom}
                        style={{ cursor: "grab" }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          dragMovedRef.current = false;
                          setDragTarget({ kind: "bundle", id: b.id, idx: i });
                          setDragPos(p);
                        }}
                      />
                    ))}
                    <text
                      x={pts[0].x}
                      y={pts[0].y - 0.012 / zoom}
                      fontSize={0.014 / zoom}
                      fill="hsl(var(--primary))"
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {b.code}
                    </text>
                  </g>
                );
              })}
              {/* Draft bundle in progress */}
              {mode === "bundle" && draftBundlePoints.length > 0 && (
                <>
                  {draftBundlePoints.length > 1 && (
                    <polyline
                      points={draftBundlePoints.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke="hsl(var(--accent))"
                      strokeWidth={0.006 / zoom}
                      strokeDasharray="0.01 0.005"
                    />
                  )}
                  {draftBundlePoints.map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={0.01 / zoom}
                      fill="hsl(var(--accent))"
                      stroke="white"
                      strokeWidth={0.002 / zoom}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setDraftBundlePoints((pts) => pts.filter((_, j) => j !== i));
                      }}
                    />
                  ))}
                </>
              )}
              {/* Branch lines: bundle anchor → cable endpoint */}
              {(branches.data ?? []).map((br) => {
                const pts = br.branchPoints ?? [];
                if (pts.length < 2) return null;
                return (
                  <g key={br.id}>
                    <polyline
                      points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke="hsl(var(--accent))"
                      strokeOpacity={0.75}
                      strokeWidth={0.003 / zoom}
                      strokeLinejoin="round"
                    />
                    <circle
                      cx={pts[0].x}
                      cy={pts[0].y}
                      r={0.004 / zoom}
                      fill="hsl(var(--accent))"
                    />
                  </g>
                );
              })}
              {/* Racks */}
              {(racks.data ?? []).map((r) => {
                const isDragging = dragTarget?.kind === "rack" && dragTarget.id === r.id && dragPos;
                const cx = isDragging ? dragPos!.x : Number(r.x);
                const cy = isDragging ? dragPos!.y : Number(r.y);
                const s = 0.018 / zoom;
                return (
                  <g key={r.id}>
                    <rect
                      x={cx - s}
                      y={cy - s}
                      width={s * 2}
                      height={s * 2}
                      fill="hsl(var(--foreground))"
                      stroke="hsl(var(--background))"
                      strokeWidth={0.002 / zoom}
                      style={{ cursor: "grab" }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        dragMovedRef.current = false;
                        setDragTarget({ kind: "rack", id: r.id });
                        setDragPos({ x: cx, y: cy });
                      }}
                    />
                    <text
                      x={cx}
                      y={cy + s + 0.012 / zoom}
                      textAnchor="middle"
                      fontSize={0.014 / zoom}
                      fill="hsl(var(--foreground))"
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {r.code}
                    </text>
                  </g>
                );
              })}
              {pendingRackPos && mode === "rack" && (
                <rect
                  x={pendingRackPos.x - 0.018 / zoom}
                  y={pendingRackPos.y - 0.018 / zoom}
                  width={0.036 / zoom}
                  height={0.036 / zoom}
                  fill="none"
                  stroke="hsl(var(--destructive))"
                  strokeWidth={0.003 / zoom}
                  strokeDasharray="0.01 0.005"
                />
              )}
              {pendingPortPos && mode === "port" && (
                <circle
                  cx={pendingPortPos.x}
                  cy={pendingPortPos.y}
                  r={0.014 / zoom}
                  fill="none"
                  stroke="hsl(var(--destructive))"
                  strokeWidth={0.003 / zoom}
                  strokeDasharray="0.01 0.005"
                />
              )}
              {(endpoints.data ?? []).map((ep) => {
                const isPatch = ep.endpoint_kind === "PATCH";
                const isRouteEnd =
                  mode === "route" &&
                  (ep.id === currentRoute?.from_endpoint_id ||
                    ep.id === currentRoute?.to_endpoint_id ||
                    ep.id === currentRoute?.rack_endpoint_id);
                const isSelected = ep.id === selectedEndpointId;
                const fill = isRouteEnd
                  ? "hsl(var(--accent))"
                  : isSelected
                    ? "hsl(var(--destructive))"
                    : isPatch
                      ? "hsl(var(--foreground))"
                      : "hsl(var(--primary))";
                const isDragging = dragTarget?.kind === "endpoint" && dragTarget.id === ep.id && dragPos;
                const cx = isDragging ? dragPos!.x : Number(ep.norm_x);
                const cy = isDragging ? dragPos!.y : Number(ep.norm_y);
                const r = 0.012 / zoom;
                const sw = 0.002 / zoom;
                const onHandleDown = (e: React.MouseEvent) => {
                  e.stopPropagation();
                  dragMovedRef.current = false;
                  setDragTarget({ kind: "endpoint", id: ep.id });
                  setDragPos({ x: cx, y: cy });
                };
                return (
                  <g
                    key={ep.id}
                    style={{ cursor: "grab" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (dragMovedRef.current) return;
                      setSelectedEndpointId(ep.id);
                    }}
                    onMouseDown={onHandleDown}
                  >
                    {isPatch ? (
                      <rect
                        x={cx - r}
                        y={cy - r}
                        width={r * 2}
                        height={r * 2}
                        fill={fill}
                        stroke="white"
                        strokeWidth={sw}
                      />
                    ) : (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={r}
                        fill={fill}
                        stroke="white"
                        strokeWidth={sw}
                      />
                    )}
                    <text
                      x={cx}
                      y={cy - r - 0.006 / zoom}
                      textAnchor="middle"
                      fontSize={0.014 / zoom}
                      fill="hsl(var(--foreground))"
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {ep.code}
                    </text>
                  </g>
                );
              })}
              {mode === "route" && draftPoints.length > 1 && (
                <polyline
                  points={draftPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke="hsl(var(--destructive))"
                  strokeWidth={0.004 / zoom}
                  strokeLinejoin="round"
                />
              )}
              {mode === "route" &&
                draftPoints.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={0.012 / zoom}
                    fill="hsl(var(--destructive))"
                    stroke="white"
                    strokeWidth={0.002 / zoom}
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
                  r={0.012 / zoom}
                  fill="none"
                  stroke="hsl(var(--destructive))"
                  strokeWidth={0.003 / zoom}
                />
              )}
            </svg>
          </div>
        </div>


        <aside className="space-y-4">
          <div className="rounded-sm border border-border p-3 text-sm">
            <div className="mb-2 font-semibold">Podklad plánu</div>
            <select
              className="w-full rounded-sm border border-input bg-background px-2 py-1.5 text-xs"
              value={plan.data?.plan.document_id ?? ""}
              onChange={(e) => changeBackgroundDoc(e.target.value || null)}
            >
              <option value="">— žádný —</option>
              {(docs.data ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
            <div className="mt-1 text-[11px] text-muted-foreground">
              PDF nebo obrázek nahraný v sekci Dokumenty.
            </div>
          </div>

          {selectedEndpointId && (
            <EndpointOperationalPanel
              projectId={projectId}
              floorPlanId={planId}
              endpointId={selectedEndpointId}
              endpoint={
                (endpoints.data ?? []).find((e) => e.id === selectedEndpointId) ?? null
              }
              routes={routes.data ?? []}
              cables={endpointCables.data ?? []}
              listUnassignedFn={async () =>
                listUnassignedFn({ data: { projectId } })
              }
              addFn={async (cableIds) => {
                await addCablesFn({
                  data: { projectId, endpointId: selectedEndpointId, cableIds },
                });
                await qc.invalidateQueries({
                  queryKey: ["endpoint-cables", selectedEndpointId],
                });
              }}
              removeFn={async (cableId) => {
                await removeCableFn({
                  data: { endpointId: selectedEndpointId, cableId },
                });
                await qc.invalidateQueries({
                  queryKey: ["endpoint-cables", selectedEndpointId],
                });
              }}
              assignRouteFn={async (routeId) => {
                const res = await assignRouteFn({
                  data: { endpointId: selectedEndpointId, routeId },
                });
                await qc.invalidateQueries({
                  queryKey: ["endpoint-cables", selectedEndpointId],
                });
                await qc.invalidateQueries({ queryKey: ["cables", projectId] });
                return res.count ?? 0;
              }}
              onClose={() => setSelectedEndpointId(null)}
            />
          )}


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

          {mode === "rack" && (
            <div className="rounded-sm border border-border p-3 text-sm">
              <div className="mb-2 font-semibold">Rack</div>
              {!pendingRackPos ? (
                <div className="text-xs text-muted-foreground">
                  Klikněte do plánu pro umístění racku.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="space-y-1.5">
                    <Label>Kód</Label>
                    <Input
                      value={newRackCode}
                      onChange={(e) => setNewRackCode(e.target.value)}
                      placeholder="RACK-A"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Název</Label>
                    <Input
                      value={newRackName}
                      onChange={(e) => setNewRackName(e.target.value)}
                      placeholder="Serverovna 1.NP"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={saveRack}>Uložit</Button>
                    <Button size="sm" variant="outline" onClick={() => setPendingRackPos(null)}>Zrušit</Button>
                  </div>
                </div>
              )}
              <div className="mt-3 max-h-48 divide-y divide-border overflow-y-auto rounded-sm border border-border">
                {(racks.data ?? []).map((r) => (
                  <div key={r.id} className="flex items-center gap-2 p-2">
                    <div className="flex-1">
                      <div className="font-mono text-xs">{r.code}</div>
                      <div className="text-[10px] text-muted-foreground">{r.name ?? "—"}</div>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => removeRack(r.id)}>✕</Button>
                  </div>
                ))}
                {(racks.data?.length ?? 0) === 0 && (
                  <div className="p-3 text-center text-xs text-muted-foreground">Zatím žádný rack.</div>
                )}
              </div>
            </div>
          )}

          {mode === "bundle" && (
            <div className="rounded-sm border border-border p-3 text-sm">
              <div className="mb-2 font-semibold">Kmen (svazek)</div>
              <div className="mb-2 text-xs text-muted-foreground">
                Klik = přidat bod. Alespoň 2 body. Dvojklik na bod = smazat.
              </div>
              <div className="mb-2 font-mono text-xs">
                Bodů: {draftBundlePoints.length} · Norm. délka: {polylineNormLength(draftBundlePoints).toFixed(4)}
              </div>
              <div className="space-y-1.5">
                <Label>Kód kmenu</Label>
                <Input
                  value={newBundleCode}
                  onChange={(e) => setNewBundleCode(e.target.value)}
                  placeholder="BND-01"
                />
              </div>
              <div className="mt-2 flex gap-2">
                <Button size="sm" className="flex-1" onClick={saveBundle}>Uložit kmen</Button>
                <Button size="sm" variant="outline" onClick={() => setDraftBundlePoints([])}>Vymazat</Button>
              </div>
              <div className="mt-3 max-h-48 divide-y divide-border overflow-y-auto rounded-sm border border-border">
                {(bundles.data ?? []).map((b) => (
                  <div key={b.id} className="flex items-center gap-2 p-2">
                    <div className="flex-1 font-mono text-xs">{b.code}</div>
                    <Button size="sm" variant="ghost" onClick={() => removeBundle(b.id)}>✕</Button>
                  </div>
                ))}
                {(bundles.data?.length ?? 0) === 0 && (
                  <div className="p-3 text-center text-xs text-muted-foreground">Zatím žádný kmen.</div>
                )}
              </div>
            </div>
          )}

          {mode === "port" && (
            <div className="rounded-sm border border-border p-3 text-sm">
              <div className="mb-2 font-semibold">Trasy</div>
              <div className="mb-2 text-xs text-muted-foreground">
                Automaticky přepočítá trasy všech kabelů: rack → nejbližší kmen → endpoint.
              </div>
              <Button
                size="sm"
                className="mb-3 w-full"
                onClick={async () => {
                  try {
                    const r = await autoAssignBundlesFn({ data: { projectId, floorPlanId: planId, overwrite: true } });
                    toast.success(`Vygenerováno: ${r.assigned} tras, přeskočeno ${r.skipped}`);
                    qc.invalidateQueries({ queryKey: ["plan-branches", projectId, planId] });
                    qc.invalidateQueries({ queryKey: ["cables", projectId] });
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Chyba");
                  }
                }}
              >
                Vygenerovat trasy
              </Button>
              <div className="mb-2 border-t border-border pt-2 text-xs font-semibold">Nový kabel z portu</div>
              <div className="mb-2 text-xs text-muted-foreground">
                1) Vyber volný port · 2) Klikni na plán · 3) Zadej kód endpointu a kabelu
              </div>
              <div className="space-y-1.5">
                <Label>Volný port</Label>
                <select
                  className="w-full rounded-sm border border-input bg-background px-2 py-1 font-mono text-xs"
                  value={selectedPortId ?? ""}
                  onChange={(e) => setSelectedPortId(e.target.value || null)}
                >
                  <option value="">— vyber —</option>
                  {(freePorts.data?.freePorts ?? []).map((p) => {
                    const panel = (freePorts.data?.panels ?? []).find((pp) => pp.id === p.panel_id);
                    return (
                      <option key={p.id} value={p.id}>
                        {panel?.code ?? "?"} · port #{p.port_number}
                        {p.label ? ` (${p.label})` : ""}
                      </option>
                    );
                  })}
                </select>
                <div className="text-[10px] text-muted-foreground">
                  {(freePorts.data?.freePorts.length ?? 0)} volných portů
                </div>
              </div>
              {pendingPortPos && selectedPortId && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  <div className="space-y-1.5">
                    <Label>Kód endpointu</Label>
                    <Input value={newPortEpCode} onChange={(e) => setNewPortEpCode(e.target.value)} placeholder="např. 201" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Kód kabelu</Label>
                    <Input value={newPortCableCode} onChange={(e) => setNewPortCableCode(e.target.value)} placeholder="např. C-201" />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={savePortCable}>Vytvořit</Button>
                    <Button size="sm" variant="outline" onClick={() => setPendingPortPos(null)}>Zrušit</Button>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Kabel se auto-přiřadí k nejbližšímu kmenu (pokud existuje).
                  </div>
                </div>
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

function PdfPlanBackground({ url, title }: { url: string; title: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;

    async function renderPdf() {
      setStatus("loading");
      try {
        const mapPrototype = Map.prototype as Map<unknown, unknown> & {
          getOrInsertComputed?: (key: unknown, callback: (key: unknown) => unknown) => unknown;
        };
        if (!mapPrototype.getOrInsertComputed) {
          mapPrototype.getOrInsertComputed = function getOrInsertComputed(key, callback) {
            if (!this.has(key)) this.set(key, callback(key));
            return this.get(key);
          };
        }

        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.mjs",
          import.meta.url,
        ).toString();

        const pdf = await pdfjs.getDocument({ url }).promise;
        const page = await pdf.getPage(1);
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        const viewport = page.getViewport({ scale: 2 });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas není dostupný");

        const task = page.render({ canvasContext: context, viewport });
        renderTask = task;
        await task.promise;
        if (!cancelled) setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          console.error("PDF podklad se nepodařilo vykreslit", err);
          setStatus("error");
        }
      }
    }

    renderPdf();
    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [url]);

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-muted select-none">
      <canvas
        ref={canvasRef}
        aria-label={title}
        className={`h-full w-full object-contain transition-opacity ${status === "ready" ? "opacity-100" : "opacity-0"}`}
      />
      {status === "loading" && (
        <div className="absolute text-xs font-mono text-muted-foreground">Načítám PDF podklad…</div>
      )}
      {status === "error" && (
        <div className="absolute max-w-xs text-center text-xs text-destructive">
          PDF podklad se nepodařilo zobrazit.
        </div>
      )}
    </div>
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
  endpoints: Array<{ id: string; code: string; endpoint_kind: string }>;
  onCreated: (id: string) => void | Promise<void>;
  createFn: (input: {
    projectId: string;
    floorPlanId: string;
    name?: string;
    fromEndpointId?: string | null;
    toEndpointId?: string | null;
    rackEndpointId?: string | null;
  }) => Promise<string>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [rackId, setRackId] = useState<string>("");
  const [endId, setEndId] = useState<string>("");

  const rackCandidates = endpoints.filter((e) => e.endpoint_kind === "PATCH");
  const endCandidates = endpoints.filter((e) => e.endpoint_kind !== "PATCH");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rackId || !endId) {
      toast.error("Vyberte rack point i end point");
      return;
    }
    try {
      const rackEp = endpoints.find((x) => x.id === rackId);
      const endEp = endpoints.find((x) => x.id === endId);
      const autoName = name.trim() || `${rackEp?.code ?? "RACK"} → ${endEp?.code ?? ""}`;
      const id = await createFn({
        projectId,
        floorPlanId,
        name: autoName,
        rackEndpointId: rackId,
        fromEndpointId: rackId,
        toEndpointId: endId,
      });
      toast.success("Trasa vytvořena");
      await onCreated(id);
      setOpen(false);
      setName("");
      setRackId("");
      setEndId("");
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
          <DialogTitle>Nová trasa Rack → Endpoint</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label>Rack point (start)</Label>
              <select
                className="w-full rounded-sm border border-input bg-background px-3 py-1.5 text-sm"
                value={rackId}
                onChange={(e) => setRackId(e.target.value)}
              >
                <option value="">—</option>
                {rackCandidates.map((ep) => (
                  <option key={ep.id} value={ep.id}>
                    {ep.code}
                  </option>
                ))}
              </select>
              {rackCandidates.length === 0 && (
                <div className="text-[10px] text-destructive">
                  Vytvořte endpoint typu PATCH.
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>End point (cíl)</Label>
              <select
                className="w-full rounded-sm border border-input bg-background px-3 py-1.5 text-sm"
                value={endId}
                onChange={(e) => setEndId(e.target.value)}
              >
                <option value="">—</option>
                {endCandidates.map((ep) => (
                  <option key={ep.id} value={ep.id}>
                    {ep.code}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Název (volitelné)</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="auto: RACK → CODE"
            />
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

type EndpointRow = {
  id: string;
  code: string;
  label: string | null;
  endpoint_kind: string;
  norm_x: number | string;
  norm_y: number | string;
};

type RouteRow = {
  id: string;
  name: string | null;
  from_endpoint_id: string | null;
  to_endpoint_id: string | null;
  rack_endpoint_id?: string | null;
};

type EndpointCableRow = {
  id: string;
  sequence: number;
  cable: {
    id: string;
    code: string;
    status: string;
    cable_type_id: string | null;
    route_id: string | null;
    computed_length_m: number | string | null;
  } | null;
};

type UnassignedCable = { id: string; code: string; status: string };

function EndpointOperationalPanel({
  endpointId,
  endpoint,
  routes,
  cables,
  listUnassignedFn,
  addFn,
  removeFn,
  assignRouteFn,
  onClose,
}: {
  projectId: string;
  floorPlanId: string;
  endpointId: string;
  endpoint: EndpointRow | null;
  routes: RouteRow[];
  cables: EndpointCableRow[];
  listUnassignedFn: () => Promise<UnassignedCable[]>;
  addFn: (cableIds: string[]) => Promise<void>;
  removeFn: (cableId: string) => Promise<void>;
  assignRouteFn: (routeId: string) => Promise<number>;
  onClose: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [unassigned, setUnassigned] = useState<UnassignedCable[]>([]);
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const routeForEndpoint = routes.find(
    (r) => r.to_endpoint_id === endpointId || r.from_endpoint_id === endpointId,
  );

  async function openAdd() {
    setShowAdd(true);
    setPickedIds(new Set());
    try {
      const list = await listUnassignedFn();
      setUnassigned(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  async function confirmAdd() {
    if (pickedIds.size === 0) return setShowAdd(false);
    try {
      await addFn(Array.from(pickedIds));
      toast.success(`Přidáno ${pickedIds.size} kabelů`);
      setShowAdd(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  async function useRouteForGroup() {
    if (!routeForEndpoint) return toast.error("Endpoint nemá trasu");
    try {
      const n = await assignRouteFn(routeForEndpoint.id);
      toast.success(`Trasa přiřazena ${n} kabelům`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  const filtered = search
    ? unassigned.filter((c) => c.code.toLowerCase().includes(search.toLowerCase()))
    : unassigned;

  return (
    <div className="rounded-sm border-2 border-destructive p-3 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="font-semibold">
            Endpoint {endpoint?.code ?? "…"}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {endpoint?.label ?? endpoint?.endpoint_kind} · operační jednotka
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          ✕
        </Button>
      </div>

      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="font-mono">
          Kabelů: <span className="font-semibold">{cables.length}</span>
        </span>
        <Button size="sm" variant="outline" onClick={openAdd}>
          + Přidat kabely
        </Button>
      </div>

      <div className="max-h-64 divide-y divide-border overflow-y-auto rounded-sm border border-border">
        {cables.length === 0 ? (
          <div className="p-3 text-center text-xs text-muted-foreground">
            Zatím žádné kabely. Přidejte je z registru.
          </div>
        ) : (
          cables.map((row) => (
            <div key={row.id} className="flex items-center gap-2 p-2">
              <div className="flex-1">
                <div className="font-mono text-xs">{row.cable?.code}</div>
                <div className="text-[10px] text-muted-foreground">
                  {row.cable?.status}
                  {row.cable?.route_id ? " · má trasu" : " · bez trasy"}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => row.cable && removeFn(row.cable.id)}
              >
                ✕
              </Button>
            </div>
          ))
        )}
      </div>

      {cables.length > 0 && routeForEndpoint && (
        <Button
          size="sm"
          variant="secondary"
          className="mt-2 w-full"
          onClick={useRouteForGroup}
        >
          Použít trasu „{routeForEndpoint.name ?? routeForEndpoint.id.slice(0, 6)}" pro celou skupinu
        </Button>
      )}
      {cables.length > 0 && !routeForEndpoint && (
        <div className="mt-2 rounded-sm bg-muted/40 p-2 text-[11px] text-muted-foreground">
          Endpoint zatím nemá trasu. V módu „Trasy" vytvořte trasu Rack → tento endpoint.
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Přidat kabely do skupiny</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Hledat podle kódu…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-72 divide-y divide-border overflow-y-auto rounded-sm border border-border">
            {filtered.length === 0 ? (
              <div className="p-3 text-center text-xs text-muted-foreground">
                Žádné nezařazené kabely.
              </div>
            ) : (
              filtered.map((c) => {
                const picked = pickedIds.has(c.id);
                return (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-2 p-2 hover:bg-muted/40"
                  >
                    <input
                      type="checkbox"
                      checked={picked}
                      onChange={() => {
                        setPickedIds((s) => {
                          const n = new Set(s);
                          if (picked) n.delete(c.id);
                          else n.add(c.id);
                          return n;
                        });
                      }}
                    />
                    <span className="flex-1 font-mono text-xs">{c.code}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {c.status}
                    </span>
                  </label>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Zrušit
            </Button>
            <Button onClick={confirmAdd}>
              Přidat ({pickedIds.size})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

