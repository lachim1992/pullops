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
import { getFloorPlan, setCalibration, setFloorPlanPublished, updateFloorPlan } from "@/lib/floorPlans.functions";
import { listProjectDocuments } from "@/lib/documents.functions";
import {
  assignCableToDayPlan,
  deleteDayPlan,
  listDayPlans,
  upsertDayPlan,
  listDayPlanPhotos,
  addDayPlanPhoto,
  deleteDayPlanPhoto,
} from "@/lib/pullDayPlans.functions";
import {
  listSpoolsForPlanning,
  assignSpoolToPlan,
  unassignSpoolFromPlan,
} from "@/lib/planSpools.functions";
import { runOptimizer } from "@/lib/pullOptimizer.functions";
import { getPlanMeterage, setPlanCableBundle, assignSpoolToFloorPlan, unassignSpoolFromFloorPlan } from "@/lib/planMeterage.functions";
import { listProjectMembersLite } from "@/lib/defects.functions";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { PlanCanvasSurface } from "@/components/plan-canvas-surface";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight, Camera, Trash2, X } from "lucide-react";

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
import {
  createBundle,
  listBundles,
  deleteBundle,
  updateBundle,
} from "@/lib/cableBundles.functions";
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
import { endpointKindInfo, ENDPOINT_KIND_GROUPS, type EndpointKind } from "@/lib/endpointKinds";

export const Route = createFileRoute("/_authenticated/projects/$projectId/plans/$planId")({
  head: () => ({
    meta: [{ title: "Editor plánu · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: PlanEditorPage,
});

type Mode = "calibrate" | "endpoint" | "route" | "rack" | "bundle" | "port" | "publish" | "meterage";

type BundleSegmentType = "DIRECT" | "TRAY" | "WALL" | "CEILING";
type BundleSegment = { type: BundleSegmentType; extra_pct: number };

const BUNDLE_SEGMENT_TYPES: Record<
  BundleSegmentType,
  { label: string; color: string; extra_pct: number }
> = {
  DIRECT: { label: "Přímá", color: "var(--accent)", extra_pct: 0 },
  TRAY: { label: "Žlab / lišta", color: "hsl(210 80% 50%)", extra_pct: 0 },
  WALL: { label: "Výsek / trubka", color: "hsl(15 80% 55%)", extra_pct: 10 },
  CEILING: { label: "Podhled", color: "hsl(280 55% 55%)", extra_pct: 15 },
};

function defaultSegment(): BundleSegment {
  return { type: "DIRECT", extra_pct: BUNDLE_SEGMENT_TYPES.DIRECT.extra_pct };
}

function PlanEditorPage() {
  const { projectId, planId } = useParams({
    from: "/_authenticated/projects/$projectId/plans/$planId",
  });
  const getPlanFn = useServerFn(getFloorPlan);
  const setCalFn = useServerFn(setCalibration);
  const updatePlanFn = useServerFn(updateFloorPlan);
  const publishPlanFn = useServerFn(setFloorPlanPublished);
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

  const listDayPlansFn = useServerFn(listDayPlans);
  const upsertDayPlanFn = useServerFn(upsertDayPlan);
  const deleteDayPlanFn = useServerFn(deleteDayPlan);
  const assignCableFn = useServerFn(assignCableToDayPlan);
  const dayPlansQuery = useQuery({
    queryKey: ["day-plans", projectId, planId],
    queryFn: () => listDayPlansFn({ data: { projectId, floorPlanId: planId } }),
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
  const [newEpKind, setNewEpKind] = useState<EndpointKind>("WORKSTATION");
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
  const [draftBundleSegments, setDraftBundleSegments] = useState<BundleSegment[]>([]);
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
  const [isPanning, setIsPanning] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const panStateRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(
    null,
  );
  const spaceDownRef = useRef(false);
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const commitRafRef = useRef<number | null>(null);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  // Apply transform directly to DOM (bypasses React re-render during pan/zoom).
  function applyTransformNow() {
    const el = contentRef.current;
    if (!el) return;
    const p = panRef.current;
    const z = zoomRef.current;
    el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) scale(${z})`;
  }
  function scheduleApply() {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      applyTransformNow();
    });
  }
  // Commit refs → React state (throttled) so SVG stroke widths, etc. stay in sync.
  function commitStateSoon() {
    if (commitRafRef.current != null) cancelAnimationFrame(commitRafRef.current);
    commitRafRef.current = requestAnimationFrame(() => {
      commitRafRef.current = null;
      setZoom(zoomRef.current);
      setPan(panRef.current);
    });
  }
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (commitRafRef.current != null) cancelAnimationFrame(commitRafRef.current);
    };
  }, []);
  // Keep DOM in sync when React state changes for reasons other than interaction (e.g. resetView).
  useEffect(() => {
    applyTransformNow();
  }, [zoom, pan]);

  function clampZoom(z: number) {
    return Math.max(0.25, Math.min(12, z));
  }
  function zoomAt(clientX: number, clientY: number, factor: number, commit = true) {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const z = zoomRef.current;
    const nz = clampZoom(z * factor);
    if (nz === z) return;
    const real = nz / z;
    const p = panRef.current;
    const newPan = { x: px - (px - p.x) * real, y: py - (py - p.y) * real };
    zoomRef.current = nz;
    panRef.current = newPan;
    scheduleApply();
    if (commit) commitStateSoon();
  }

  // Native non-passive wheel listener → smooth zoom without page scroll
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const factor = Math.exp(-dy * 0.0018);
      // During rapid wheel spinning we skip commit; a trailing rAF commit is scheduled.
      zoomAt(e.clientX, e.clientY, factor, true);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Global pan handlers so drag doesn't get stuck when leaving the viewport.
  // Uses direct DOM writes + rAF; no React re-render until mouseup.
  useEffect(() => {
    if (!isPanning) return;
    const onMove = (e: MouseEvent) => {
      const st = panStateRef.current;
      if (!st) return;
      panRef.current = {
        x: st.ox + (e.clientX - st.startX),
        y: st.oy + (e.clientY - st.startY),
      };
      scheduleApply();
    };
    const onUp = () => {
      panStateRef.current = null;
      setIsPanning(false);
      // Commit final pan into React state.
      setPan({ ...panRef.current });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isPanning]);

  // Touch support: single-finger pan, two-finger pinch zoom (mobile).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    let mode: "none" | "pan" | "pinch" = "none";
    let startX = 0;
    let startY = 0;
    let ox = 0;
    let oy = 0;
    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    let pinchCenter = { x: 0, y: 0 };

    const dist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        // Only initiate touch-pan when target isn't an interactive SVG element.
        const t = e.target as Element | null;
        if (t && t instanceof SVGElement && t.tagName !== "svg") return;
        mode = "pan";
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        ox = panRef.current.x;
        oy = panRef.current.y;
      } else if (e.touches.length === 2) {
        mode = "pinch";
        pinchStartDist = dist(e.touches[0], e.touches[1]);
        pinchStartZoom = zoomRef.current;
        const rect = el.getBoundingClientRect();
        pinchCenter = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top,
        };
        e.preventDefault();
      }
    };
    const onMove = (e: TouchEvent) => {
      if (mode === "pan" && e.touches.length === 1) {
        panRef.current = {
          x: ox + (e.touches[0].clientX - startX),
          y: oy + (e.touches[0].clientY - startY),
        };
        scheduleApply();
        e.preventDefault();
      } else if (mode === "pinch" && e.touches.length === 2 && pinchStartDist > 0) {
        const d = dist(e.touches[0], e.touches[1]);
        const nz = clampZoom(pinchStartZoom * (d / pinchStartDist));
        const z = zoomRef.current;
        if (nz !== z) {
          const real = nz / z;
          const p = panRef.current;
          panRef.current = {
            x: pinchCenter.x - (pinchCenter.x - p.x) * real,
            y: pinchCenter.y - (pinchCenter.y - p.y) * real,
          };
          zoomRef.current = nz;
          scheduleApply();
        }
        e.preventDefault();
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        if (mode !== "none") {
          setPan({ ...panRef.current });
          setZoom(zoomRef.current);
        }
        mode = "none";
      }
    };
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  // Space bar → hold to pan with left mouse
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      spaceDownRef.current = true;
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceDownRef.current = false;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  function handleViewportMouseDown(e: React.MouseEvent) {
    if (
      e.button === 1 ||
      e.button === 2 ||
      (e.button === 0 && (e.altKey || spaceDownRef.current))
    ) {
      e.preventDefault();
      panStateRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        ox: panRef.current.x,
        oy: panRef.current.y,
      };
      setIsPanning(true);
    }
  }
  function resetView() {
    zoomRef.current = 1;
    panRef.current = { x: 0, y: 0 };
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
      if (!newEpCode.trim()) {
        const codes = new Set((endpoints.data ?? []).map((e) => e.code));
        let n = codes.size + 1;
        let candidate = `EP${String(n).padStart(3, "0")}`;
        while (codes.has(candidate)) {
          n += 1;
          candidate = `EP${String(n).padStart(3, "0")}`;
        }
        setNewEpCode(candidate);
      }
    } else if (mode === "route") {
      if (!selectedRouteId) {
        toast.error("Nejprve vyberte nebo vytvořte trasu");
        return;
      }
      setDraftPoints((pts) => [...pts, pos]);
    } else if (mode === "rack") {
      setPendingRackPos(pos);
    } else if (mode === "bundle") {
      setDraftBundlePoints((pts) => {
        const next = [...pts, pos];
        if (next.length >= 2) {
          setDraftBundleSegments((segs) => {
            if (segs.length >= next.length - 1) return segs;
            return [...segs, defaultSegment()];
          });
        }
        return next;
      });
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
      const needed = Math.max(0, draftBundlePoints.length - 1);
      const segs: BundleSegment[] = Array.from(
        { length: needed },
        (_, i) => draftBundleSegments[i] ?? defaultSegment(),
      );
      await createBundleFn({
        data: {
          projectId,
          floorPlanId: planId,
          code: newBundleCode.trim(),
          points: draftBundlePoints,
          segments: segs,
        },
      });
      setDraftBundlePoints([]);
      setDraftBundleSegments([]);
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

  // Per-tab visibility flags. Bundles, racks and endpoints are always visible
  // (ghosted in modes where they aren't the primary target) so the user has
  // spatial context while editing another layer.
  const showBundles = mode !== "calibrate";
  const bundlesGhost = mode !== "bundle" && mode !== "port";
  const showRacks = mode !== "calibrate";
  const racksGhost = mode !== "rack" && mode !== "port";
  const showEndpoints = mode !== "calibrate";
  const endpointsGhost = mode !== "endpoint" && mode !== "port";
  const showBranches = mode === "port";
  const racksInteractive = mode === "rack";
  const endpointsInteractive = mode === "endpoint";
  const bundlePointsInteractive = mode === "bundle";

  return (
    <AppShell projectId={projectId}>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{plan.data?.plan.name}</h1>
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
          </div>
        </div>
        <div className="flex flex-wrap gap-1 rounded-md border border-border bg-muted/40 p-1">
          <Button
            variant={mode === "endpoint" ? "default" : "ghost"}
            size="sm"
            onClick={() => setMode("endpoint")}
          >
            1 · Endpointy
          </Button>
          <Button
            variant={mode === "rack" ? "default" : "ghost"}
            size="sm"
            onClick={() => setMode("rack")}
          >
            2 · Racky
          </Button>
          <Button
            variant={mode === "bundle" ? "default" : "ghost"}
            size="sm"
            onClick={() => setMode("bundle")}
          >
            3 · Kmeny
          </Button>
          <Button
            variant={mode === "port" ? "default" : "ghost"}
            size="sm"
            onClick={() => setMode("port")}
          >
            4 · Trasy
          </Button>
          <Button
            variant={mode === "calibrate" ? "default" : "ghost"}
            size="sm"
            onClick={() => setMode("calibrate")}
          >
            Kalibrace
          </Button>
          <Button
            variant={mode === "meterage" ? "default" : "ghost"}
            size="sm"
            onClick={() => setMode("meterage")}
          >
            Metráž & Spulky
          </Button>
          <Button
            variant={mode === "publish" ? "default" : "ghost"}
            size="sm"
            onClick={() => setMode("publish")}
          >
            5 · Zadat plán
          </Button>
        </div>
      </header>


      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div
          ref={viewportRef}
          className="field-plan-viewer relative h-[calc(100vh-220px)] min-h-[560px] w-full overflow-hidden rounded-sm border border-border bg-muted"
          style={{ cursor: isPanning ? "grabbing" : spaceDownRef.current ? "grab" : "default", touchAction: "none" }}
          onMouseDown={handleViewportMouseDown}
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
            Kolečko = zoom · Space/Alt/střední tlač. + tažení = posun
          </div>

          <div
            className="absolute inset-0"
          >
            <PlanCanvasSurface
              documentUrl={plan.data?.documentUrl ?? null}
              mimeType={plan.data?.document?.mime_type ?? null}
              title={plan.data?.plan.name ?? "Plán"}
              empty="Bez podkladového obrázku — vyberte podklad vpravo"
              fullscreenTargetRef={viewportRef}
              contentRef={contentRef}
              contentClassName="origin-top-left"
              contentStyle={{ transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})` }}
            >

            <svg
              ref={svgRef}
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              className="absolute inset-0 h-full w-full cursor-crosshair"
              onClick={handleSvgClick}
              onMouseMove={handleSvgMove}
              onMouseUp={() => {
                setDraggingIdx(null);
                void commitDrag();
              }}
              onMouseLeave={() => {
                setDraggingIdx(null);
                void commitDrag();
              }}
            >
              {calibration && (
                <>
                  <line
                    x1={calibration.a.x}
                    y1={calibration.a.y}
                    x2={calibration.b.x}
                    y2={calibration.b.y}
                    stroke="var(--accent)"
                    strokeWidth={0.003}
                  />
                  <circle
                    cx={calibration.a.x}
                    cy={calibration.a.y}
                    r={0.002}
                    fill="var(--accent)"
                    stroke="var(--background)"
                    strokeWidth={0.0005}
                  />
                  <circle
                    cx={calibration.b.x}
                    cy={calibration.b.y}
                    r={0.002}
                    fill="var(--accent)"
                    stroke="var(--background)"
                    strokeWidth={0.0005}
                  />
                </>
              )}
              {mode === "calibrate" && calA && (
                <circle
                  cx={calA.x}
                  cy={calA.y}
                  r={0.0025}
                  fill="var(--primary)"
                  stroke="var(--background)"
                  strokeWidth={0.0005}
                />
              )}
              {mode === "calibrate" && calB && (
                <circle
                  cx={calB.x}
                  cy={calB.y}
                  r={0.0025}
                  fill="var(--primary)"
                  stroke="var(--background)"
                  strokeWidth={0.0005}
                />
              )}
              {mode === "calibrate" && calA && calB && (
                <line
                  x1={calA.x}
                  y1={calA.y}
                  x2={calB.x}
                  y2={calB.y}
                  stroke="var(--primary)"
                  strokeWidth={0.003}
                  strokeDasharray="0.01 0.005"
                />
              )}
              {/* Bundles (kmeny) */}
              {showBundles &&
                (bundles.data ?? []).map((b) => {
                  const rawPts = (b.points as unknown as NormPoint[]) ?? [];
                  if (rawPts.length < 2) return null;
                  const pts = rawPts.map((p, i) =>
                    dragTarget &&
                    dragTarget.kind === "bundle" &&
                    dragTarget.id === b.id &&
                    dragTarget.idx === i &&
                    dragPos
                      ? dragPos
                      : p,
                  );
                  const opacity = bundlesGhost ? 0.35 : 0.9;
                  const savedSegs = (b as unknown as { segments?: BundleSegment[] }).segments ?? [];
                  return (
                    <g key={b.id} opacity={opacity}>
                      {pts.length > 1 &&
                        pts.slice(0, -1).map((p1, i) => {
                          const p2 = pts[i + 1];
                          const seg = savedSegs[i];
                          const color = seg
                            ? (BUNDLE_SEGMENT_TYPES[seg.type]?.color ?? "var(--primary)")
                            : "var(--primary)";
                          return (
                            <line
                              key={`seg-${i}`}
                              x1={p1.x}
                              y1={p1.y}
                              x2={p2.x}
                              y2={p2.y}
                              stroke={color}
                              strokeWidth={0.014 / zoom}
                              strokeLinecap="round"
                            />
                          );
                        })}
                      {bundlePointsInteractive &&
                        pts.map((p, i) => (
                          <circle
                            key={i}
                            cx={p.x}
                            cy={p.y}
                            r={0.008 / zoom}
                            fill="var(--primary)"
                            stroke="var(--background)"
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
                        fill="var(--primary)"
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
                  {draftBundlePoints.length > 1 &&
                    draftBundlePoints.slice(0, -1).map((p1, i) => {
                      const p2 = draftBundlePoints[i + 1];
                      const seg = draftBundleSegments[i] ?? defaultSegment();
                      const color = BUNDLE_SEGMENT_TYPES[seg.type].color;
                      return (
                        <line
                          key={`draft-seg-${i}`}
                          x1={p1.x}
                          y1={p1.y}
                          x2={p2.x}
                          y2={p2.y}
                          stroke={color}
                          strokeWidth={0.006 / zoom}
                          strokeDasharray="0.01 0.005"
                          strokeLinecap="round"
                        />
                      );
                    })}
                  {draftBundlePoints.map((p, i) => (
                    <circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={0.01 / zoom}
                      fill="var(--accent)"
                      stroke="var(--background)"
                      strokeWidth={0.002 / zoom}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setDraftBundlePoints((pts) => pts.filter((_, j) => j !== i));
                        setDraftBundleSegments((segs) => {
                          // segment between i-1 and i disappears when point i removed
                          const idx = Math.max(0, i - 1);
                          return segs.filter((_, j) => j !== idx);
                        });
                      }}
                    />
                  ))}
                </>
              )}
              {/* Branch lines: bundle anchor → cable endpoint */}
              {showBranches &&
                (branches.data ?? []).map((br) => {
                  const pts = br.branchPoints ?? [];
                  if (pts.length < 2) return null;
                  return (
                    <g key={br.id}>
                      <polyline
                        points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill="none"
                        stroke="var(--accent)"
                        strokeOpacity={0.85}
                        strokeWidth={0.003 / zoom}
                        strokeLinejoin="round"
                      />
                      <circle
                        cx={pts[0].x}
                        cy={pts[0].y}
                        r={0.004 / zoom}
                        fill="var(--accent)"
                      />
                    </g>
                  );
                })}
              {/* Racks */}
              {showRacks &&
                (racks.data ?? []).map((r) => {
                  const isDragging =
                    dragTarget?.kind === "rack" && dragTarget.id === r.id && dragPos;
                  const cx = isDragging ? dragPos!.x : Number(r.x);
                  const cy = isDragging ? dragPos!.y : Number(r.y);
                  const s = 0.018 / zoom;
                  const opacity = racksGhost ? 0.4 : 1;
                  return (
                    <g key={r.id} opacity={opacity}>
                      <rect
                        x={cx - s}
                        y={cy - s}
                        width={s * 2}
                        height={s * 2}
                        fill="var(--foreground)"
                        stroke="var(--background)"
                        strokeWidth={0.002 / zoom}
                        style={{ cursor: racksInteractive ? "grab" : "default" }}
                        onMouseDown={(e) => {
                          if (!racksInteractive) return;
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
                        fill="var(--foreground)"
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
                  stroke="var(--destructive)"
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
                  stroke="var(--destructive)"
                  strokeWidth={0.003 / zoom}
                  strokeDasharray="0.01 0.005"
                />
              )}
              {showEndpoints &&
                (endpoints.data ?? []).map((ep) => {
                  const kindInfo = endpointKindInfo(ep.endpoint_kind);
                  const isPatch = ep.endpoint_kind === "PATCH";
                  const isSelected = ep.id === selectedEndpointId;
                  const fill = isSelected ? "var(--destructive)" : kindInfo.color;
                  const isDragging =
                    dragTarget?.kind === "endpoint" && dragTarget.id === ep.id && dragPos;
                  const cx = isDragging ? dragPos!.x : Number(ep.norm_x);
                  const cy = isDragging ? dragPos!.y : Number(ep.norm_y);
                  const r = 0.012 / zoom;
                  const sw = 0.002 / zoom;
                  const opacity = endpointsGhost ? 0.55 : 1;
                  const onHandleDown = (e: React.MouseEvent) => {
                    if (!endpointsInteractive) return;
                    e.stopPropagation();
                    dragMovedRef.current = false;
                    setDragTarget({ kind: "endpoint", id: ep.id });
                    setDragPos({ x: cx, y: cy });
                  };
                  return (
                    <g
                      key={ep.id}
                      opacity={opacity}
                      style={{ cursor: endpointsInteractive ? "grab" : "pointer" }}
                      onClick={(e) => {
                        // Only consume the click when this dot is the interactive target.
                        // In bundle / rack / calibrate modes, let the click bubble up so the
                        // canvas can add points there instead of getting swallowed by the endpoint dot.
                        if (mode !== "endpoint" && mode !== "port" && mode !== "route") return;
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
                          stroke="var(--background)"
                          strokeWidth={sw}
                        />
                      ) : (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={r}
                          fill={fill}
                          stroke="var(--background)"
                          strokeWidth={sw}
                        />
                      )}
                      <text
                        x={cx}
                        y={cy - r - 0.006 / zoom}
                        textAnchor="middle"
                        fontSize={0.014 / zoom}
                        fill="var(--foreground)"
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
                  stroke="var(--destructive)"
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
                    fill="var(--destructive)"
                    stroke="var(--background)"
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
                  stroke="var(--destructive)"
                  strokeWidth={0.003 / zoom}
                />
              )}
            </svg>
            </PlanCanvasSurface>
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
              endpoint={(endpoints.data ?? []).find((e) => e.id === selectedEndpointId) ?? null}
              routes={routes.data ?? []}
              cables={endpointCables.data ?? []}
              listUnassignedFn={async () => listUnassignedFn({ data: { projectId } })}
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

          {mode === "meterage" && (
            <MeteragePanel projectId={projectId} floorPlanId={planId} />
          )}



          {mode === "publish" && (
            <div className="rounded-sm border border-border p-3 text-sm">
              <div className="mb-2 font-semibold">Zadat plán do režimu tahání</div>
              <div className="mb-3 text-xs text-muted-foreground">
                Publikováním se plán zpřístupní v <b>Režimu tahání</b> pro montážní tým.
                Editace zůstane možná v tomto editoru; publikace pouze rozhoduje o viditelnosti v poli.
              </div>
              <div className="mb-3 rounded-sm border border-border bg-muted/40 p-2 font-mono text-xs">
                {plan.data?.plan.published_to_pull ? (
                  <>
                    <div className="text-emerald-600 dark:text-emerald-400">● Publikováno</div>
                    {plan.data.plan.published_at && (
                      <div className="text-muted-foreground">
                        {new Date(plan.data.plan.published_at as string).toLocaleString("cs-CZ")}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-muted-foreground">○ Nepublikováno</div>
                )}
              </div>
              <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-sm border border-border p-2">
                  <div className="text-muted-foreground">Endpointů</div>
                  <div className="font-mono text-sm">{endpoints.data?.length ?? 0}</div>
                </div>
                <div className="rounded-sm border border-border p-2">
                  <div className="text-muted-foreground">Kmeny</div>
                  <div className="font-mono text-sm">{bundles.data?.length ?? 0}</div>
                </div>
                <div className="rounded-sm border border-border p-2">
                  <div className="text-muted-foreground">Racky</div>
                  <div className="font-mono text-sm">{racks.data?.length ?? 0}</div>
                </div>
                <div className="rounded-sm border border-border p-2">
                  <div className="text-muted-foreground">Trasy</div>
                  <div className="font-mono text-sm">{branches.data?.length ?? 0}</div>
                </div>
              </div>
              {!calibration && (
                <div className="mb-3 rounded-sm border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive">
                  Plán není zkalibrován — délky kabelů nebudou spočítány.
                </div>
              )}
              <Button
                size="sm"
                className="w-full"
                variant={plan.data?.plan.published_to_pull ? "outline" : "default"}
                onClick={async () => {
                  try {
                    await publishPlanFn({
                      data: {
                        id: planId,
                        published: !plan.data?.plan.published_to_pull,
                      },
                    });
                    await qc.invalidateQueries({ queryKey: ["plan", planId] });
                    toast.success(
                      plan.data?.plan.published_to_pull
                        ? "Plán stažen z režimu tahání"
                        : "Plán publikován do režimu tahání",
                    );
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                {plan.data?.plan.published_to_pull ? "Stáhnout z režimu tahání" : "Publikovat do režimu tahání"}
              </Button>
            </div>
          )}

          {mode === "publish" && (
            <DayPlanEditor
              projectId={projectId}
              planId={planId}
              dayPlans={dayPlansQuery.data?.plans ?? []}
              assignments={dayPlansQuery.data?.assignments ?? []}
              branches={branches.data ?? []}
              onCreate={async () => {
                const nextOrder = (dayPlansQuery.data?.plans.length ?? 0);
                await upsertDayPlanFn({
                  data: {
                    projectId,
                    floorPlanId: planId,
                    name: `Den ${nextOrder + 1}`,
                    sortOrder: nextOrder,
                    spoolCount: 3,
                    spoolLengthM: 305,
                  },
                });
                qc.invalidateQueries({ queryKey: ["day-plans", projectId, planId] });
              }}
              onUpdate={async (patch) => {
                await upsertDayPlanFn({ data: { ...patch, projectId, floorPlanId: planId } });
                qc.invalidateQueries({ queryKey: ["day-plans", projectId, planId] });
              }}
              onDelete={async (id) => {
                await deleteDayPlanFn({ data: { id } });
                qc.invalidateQueries({ queryKey: ["day-plans", projectId, planId] });
              }}
              onAssign={async (cableId, dayPlanId) => {
                await assignCableFn({ data: { projectId, cableId, dayPlanId, sortOrder: 0 } });
                qc.invalidateQueries({ queryKey: ["day-plans", projectId, planId] });
              }}
            />
          )}





          {mode === "endpoint" && (
            <div className="rounded-sm border border-border p-3 text-sm">
              <div className="mb-2 font-semibold">Nový endpoint</div>
              {!pendingPos ? (
                <div className="text-xs text-muted-foreground">Klikněte do plánu pro umístění.</div>
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
                      onChange={(e) => setNewEpKind(e.target.value as EndpointKind)}
                    >
                      {ENDPOINT_KIND_GROUPS.map((g) => (
                        <optgroup key={g.id} label={g.label}>
                          {g.kinds.map((k) => (
                            <option key={k.value} value={k.value}>
                              {k.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={saveEndpoint}>
                      Uložit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPendingPos(null)}>
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
                    <div>Norm. délka: {polylineNormLength(draftPoints).toFixed(4)}</div>
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
                    <Button size="sm" variant="outline" onClick={() => setDraftPoints([])}>
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
                    <Button size="sm" className="flex-1" onClick={saveRack}>
                      Uložit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPendingRackPos(null)}>
                      Zrušit
                    </Button>
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
                    <Button size="sm" variant="ghost" onClick={() => removeRack(r.id)}>
                      ✕
                    </Button>
                  </div>
                ))}
                {(racks.data?.length ?? 0) === 0 && (
                  <div className="p-3 text-center text-xs text-muted-foreground">
                    Zatím žádný rack.
                  </div>
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
                Bodů: {draftBundlePoints.length} · Norm. délka:{" "}
                {polylineNormLength(draftBundlePoints).toFixed(4)}
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
                <Button size="sm" className="flex-1" onClick={saveBundle}>
                  Uložit kmen
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDraftBundlePoints([]);
                    setDraftBundleSegments([]);
                  }}
                >
                  Vymazat
                </Button>
              </div>

              {draftBundlePoints.length >= 2 && (
                <div className="mt-3">
                  <div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
                    Typ trasy pro každý úsek
                  </div>
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-sm border border-border p-2">
                    {draftBundlePoints.slice(0, -1).map((_, i) => {
                      const seg = draftBundleSegments[i] ?? defaultSegment();
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span
                            className="inline-block h-3 w-3 rounded-sm border border-border"
                            style={{ background: BUNDLE_SEGMENT_TYPES[seg.type].color }}
                          />
                          <span className="font-mono text-[11px] text-muted-foreground">
                            #{i + 1}
                          </span>
                          <select
                            className="flex-1 rounded-sm border border-input bg-background px-1.5 py-1 text-xs"
                            value={seg.type}
                            onChange={(e) => {
                              const t = e.target.value as BundleSegmentType;
                              setDraftBundleSegments((prev) => {
                                const next = draftBundlePoints
                                  .slice(0, -1)
                                  .map((_, j) => prev[j] ?? defaultSegment());
                                next[i] = { type: t, extra_pct: BUNDLE_SEGMENT_TYPES[t].extra_pct };
                                return next;
                              });
                            }}
                          >
                            {(Object.keys(BUNDLE_SEGMENT_TYPES) as BundleSegmentType[]).map((k) => (
                              <option key={k} value={k}>
                                {BUNDLE_SEGMENT_TYPES[k].label}
                                {BUNDLE_SEGMENT_TYPES[k].extra_pct > 0
                                  ? ` (+${BUNDLE_SEGMENT_TYPES[k].extra_pct}%)`
                                  : ""}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="mt-3 max-h-48 divide-y divide-border overflow-y-auto rounded-sm border border-border">
                {(bundles.data ?? []).map((b) => (
                  <div key={b.id} className="flex items-center gap-2 p-2">
                    <div className="flex-1 font-mono text-xs">{b.code}</div>
                    <Button size="sm" variant="ghost" onClick={() => removeBundle(b.id)}>
                      ✕
                    </Button>
                  </div>
                ))}
                {(bundles.data?.length ?? 0) === 0 && (
                  <div className="p-3 text-center text-xs text-muted-foreground">
                    Zatím žádný kmen.
                  </div>
                )}
              </div>
            </div>
          )}

          {mode === "port" && (
            <div className="rounded-sm border border-border p-3 text-sm">
              <div className="mb-2 font-semibold">Trasy</div>
              <div className="mb-2 rounded-sm bg-muted/40 p-2 font-mono text-[11px]">
                <div>Kmenů: {bundles.data?.length ?? 0}</div>
                <div>Endpointů: {endpoints.data?.length ?? 0}</div>
                <div>Racků: {racks.data?.length ?? 0}</div>
                <div>Vygenerovaných tras: {branches.data?.length ?? 0}</div>
              </div>
              {(bundles.data?.length ?? 0) === 0 ? (
                <div className="mb-3 rounded-sm border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                  Není nakreslen žádný kmen. Přejděte na <b>Kmeny</b> a zakreslete hlavní tahací
                  cestu — bez ní nelze generovat trasy.
                </div>
              ) : (
                <div className="mb-2 text-xs text-muted-foreground">
                  Přepočítá trasy kabelů na tomto plánu: <b>rack → nejbližší kmen → endpoint</b>.
                </div>
              )}
              <Button
                size="sm"
                className="mb-3 w-full"
                disabled={(bundles.data?.length ?? 0) === 0}
                onClick={async () => {
                  try {
                    const r = await autoAssignBundlesFn({
                      data: { projectId, floorPlanId: planId, overwrite: true },
                    });
                    if (r.reason === "no_bundles") {
                      toast.error("Na tomto plánu není nakreslen žádný kmen");
                    } else if (r.reason === "no_endpoints") {
                      toast.error("Na tomto plánu nejsou žádné endpointy");
                    } else if (r.assigned === 0) {
                      toast.error(
                        "0 tras — kabely na tomto plánu nejsou připojené k endpointům nebo už neexistují",
                      );
                    } else {
                      toast.success(`Vygenerováno ${r.assigned} tras · přeskočeno ${r.skipped}`);
                    }
                    qc.invalidateQueries({ queryKey: ["plan-branches", projectId, planId] });
                    qc.invalidateQueries({ queryKey: ["cables", projectId] });
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Chyba");
                  }
                }}
              >
                Vygenerovat trasy (tento plán)
              </Button>
              {(branches.data?.length ?? 0) > 0 && (
                <div className="mb-3 max-h-40 divide-y divide-border overflow-y-auto rounded-sm border border-border text-xs">
                  {(branches.data ?? []).map((br) => (
                    <div key={br.id} className="flex items-center justify-between gap-2 p-1.5">
                      <span className="font-mono truncate">{br.code}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {br.branchPoints.length} bodů
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mb-2 border-t border-border pt-2 text-xs font-semibold">
                Nový kabel z portu
              </div>
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
                  {freePorts.data?.freePorts.length ?? 0} volných portů
                </div>
              </div>
              {pendingPortPos && selectedPortId && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  <div className="space-y-1.5">
                    <Label>Kód endpointu</Label>
                    <Input
                      value={newPortEpCode}
                      onChange={(e) => setNewPortEpCode(e.target.value)}
                      placeholder="např. 201"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Kód kabelu</Label>
                    <Input
                      value={newPortCableCode}
                      onChange={(e) => setNewPortCableCode(e.target.value)}
                      placeholder="např. C-201"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={savePortCable}>
                      Vytvořit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPendingPortPos(null)}>
                      Zrušit
                    </Button>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Kabel se auto-přiřadí k nejbližšímu kmenu (pokud existuje).
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === "endpoint" && (
            <div className="rounded-sm border border-border">
              <div className="border-b border-border p-3 text-sm font-semibold">
                Endpointy na plánu ({endpoints.data?.length ?? 0})
              </div>
              <div className="max-h-96 divide-y divide-border overflow-y-auto text-sm">
                {(endpoints.data ?? []).map((ep) => {
                  const info = endpointKindInfo(ep.endpoint_kind);
                  const Icon = info.icon;
                  return (
                    <div key={ep.id} className="flex items-center gap-2 p-2">
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded-sm"
                        style={{ background: info.color, color: "white" }}
                        title={info.label}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="font-mono text-xs truncate">{ep.code}</div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {ep.label ?? info.label}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => removeEndpoint(ep.id)}>
                        ✕
                      </Button>
                    </div>
                  );
                })}
                {(endpoints.data?.length ?? 0) === 0 && (
                  <div className="p-3 text-center text-xs text-muted-foreground">
                    Zatím žádný endpoint.
                  </div>
                )}
              </div>
            </div>
          )}
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
                <div className="text-[10px] text-destructive">Vytvořte endpoint typu PATCH.</div>
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
          <div className="font-semibold">Endpoint {endpoint?.code ?? "…"}</div>
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
              <Button size="sm" variant="ghost" onClick={() => row.cable && removeFn(row.cable.id)}>
                ✕
              </Button>
            </div>
          ))
        )}
      </div>

      {cables.length > 0 && routeForEndpoint && (
        <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={useRouteForGroup}>
          Použít trasu „{routeForEndpoint.name ?? routeForEndpoint.id.slice(0, 6)}" pro celou
          skupinu
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
                    <span className="text-[10px] text-muted-foreground">{c.status}</span>
                  </label>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              Zrušit
            </Button>
            <Button onClick={confirmAdd}>Přidat ({pickedIds.size})</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type DayPlanRow = {
  id: string;
  name: string;
  sortOrder: number;
  plannedDate: string | null;
  spoolCount: number;
  spoolLengthM: number;
  notes: string | null;
  floorPlanId: string | null;
  assignedTo: string | null;
  priority: string;
  status: string;
  photoCount: number;
};
type DayPlanAssignment = { day_plan_id: string; cable_id: string; sort_order: number };
type BranchRow = { id: string; code: string };

function DayPlanEditor(props: {
  projectId: string;
  planId: string;
  dayPlans: DayPlanRow[];
  assignments: DayPlanAssignment[];
  branches: BranchRow[];
  onCreate: () => Promise<void> | void;
  onUpdate: (
    patch: {
      id: string;
      name: string;
      sortOrder: number;
      spoolCount: number;
      spoolLengthM: number;
    } & Partial<{
      plannedDate: string | null;
      notes: string | null;
      assignedTo: string | null;
      priority: string;
      status: string;
    }>,
  ) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onAssign: (cableId: string, dayPlanId: string | null) => Promise<void> | void;
}) {
  const { dayPlans, assignments, branches, onCreate, onUpdate, onDelete, onAssign } = props;
  const assignedIds = new Set(assignments.map((a) => a.cable_id));
  const unassigned = branches.filter((b) => !assignedIds.has(b.id));
  const byPlan = new Map<string, BranchRow[]>();
  for (const a of assignments) {
    const row = branches.find((b) => b.id === a.cable_id);
    if (!row) continue;
    if (!byPlan.has(a.day_plan_id)) byPlan.set(a.day_plan_id, []);
    byPlan.get(a.day_plan_id)!.push(row);
  }
  const optimizeFn = useServerFn(runOptimizer);
  const [optimizing, setOptimizing] = useState(false);

  async function runOptimize(mode: "preview" | "apply") {
    try {
      setOptimizing(true);
      const res = await optimizeFn({ data: { projectId: props.projectId, mode } });
      const s = res.summary;
      const msg =
        mode === "preview"
          ? `Náhled: přiřazeno ${s.assigned}/${s.totalCables}, spulek ${s.spoolsUsed}, odpad ${s.wastedMeters.toFixed(1)} m${
              s.skipped > 0 ? `, přeskočeno ${s.skipped}` : ""
            }`
          : `Uloženo: ${s.assigned} přiřazení, spulek ${s.spoolsUsed}, odpad ${s.wastedMeters.toFixed(1)} m`;
      toast.success(msg);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba optimalizátoru");
    } finally {
      setOptimizing(false);
    }
  }

  return (
    <div className="rounded-sm border border-border p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="font-semibold">Plánovač tažení</div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            onClick={() => runOptimize("preview")}
            disabled={optimizing || dayPlans.length === 0}
            className="h-7 text-xs"
          >
            Optim. náhled
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => runOptimize("apply")}
            disabled={optimizing || dayPlans.length === 0}
            className="h-7 text-xs"
          >
            Optim. použít
          </Button>
          <Button size="sm" variant="outline" onClick={() => onCreate()} className="h-7 text-xs">
            + Den
          </Button>
        </div>
      </div>
      <div className="mb-2 text-xs text-muted-foreground">
        Rozděl kabely do dní / směn a nastav kapacitu cívek. Optimalizátor auto-přiřadí kabely do bloků podle kapacity a fyzických spulek. Publikace zpřístupní bloky v Režimu tahání.
      </div>
      {dayPlans.length === 0 && (
        <div className="rounded-sm border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
          Zatím žádný blok. Klikni „+ Den".
        </div>
      )}
      <div className="space-y-3">
        {dayPlans.map((dp) => (
          <DayPlanCard
            key={dp.id}
            projectId={props.projectId}
            dp={dp}
            cables={byPlan.get(dp.id) ?? []}
            unassigned={unassigned}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onAssign={onAssign}
          />
        ))}
      </div>
      {unassigned.length > 0 && (
        <div className="mt-3 text-[10px] text-muted-foreground">
          Nezařazeno: <span className="font-mono">{unassigned.length}</span> kabelů
        </div>
      )}
    </div>
  );
}

const PRIORITY_LABEL: Record<string, string> = {
  LOW: "Nízká",
  NORMAL: "Normální",
  HIGH: "Vysoká",
  URGENT: "Kritická",
};
const STATUS_LABEL: Record<string, string> = {
  PLANNED: "Naplánováno",
  IN_PROGRESS: "Probíhá",
  DONE: "Hotovo",
  CANCELLED: "Zrušeno",
};
const PRIORITY_COLOR: Record<string, string> = {
  LOW: "bg-muted text-muted-foreground",
  NORMAL: "bg-muted text-foreground",
  HIGH: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  URGENT: "bg-destructive/15 text-destructive",
};

function DayPlanCard({
  projectId,
  dp,
  cables,
  unassigned,
  onUpdate,
  onDelete,
  onAssign,
}: {
  projectId: string;
  dp: DayPlanRow;
  cables: BranchRow[];
  unassigned: BranchRow[];
  onUpdate: (patch: {
    id: string;
    name: string;
    sortOrder: number;
    spoolCount: number;
    spoolLengthM: number;
    plannedDate?: string | null;
    notes?: string | null;
    assignedTo?: string | null;
    priority?: string;
    status?: string;
  }) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  onAssign: (cableId: string, dayPlanId: string | null) => Promise<void> | void;
}) {
  const virtualCapacity = dp.spoolCount * dp.spoolLengthM;
  const [expanded, setExpanded] = useState(false);
  const [notesDraft, setNotesDraft] = useState<string>(dp.notes ?? "");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    setNotesDraft(dp.notes ?? "");
  }, [dp.notes]);

  const membersFn = useServerFn(listProjectMembersLite);
  const members = useQuery({
    queryKey: ["project-members-lite", projectId],
    queryFn: () => membersFn({ data: { projectId } }),
    enabled: expanded,
  });

  const photosFn = useServerFn(listDayPlanPhotos);
  const addPhotoFn = useServerFn(addDayPlanPhoto);
  const delPhotoFn = useServerFn(deleteDayPlanPhoto);
  const photos = useQuery({
    queryKey: ["day-plan-photos", dp.id],
    queryFn: () => photosFn({ data: { dayPlanId: dp.id } }),
    enabled: expanded,
  });

  const spoolsFn = useServerFn(listSpoolsForPlanning);
  const assignSpFn = useServerFn(assignSpoolToPlan);
  const unassignSpFn = useServerFn(unassignSpoolFromPlan);
  const spoolsQ = useQuery({
    queryKey: ["plan-spools", projectId],
    queryFn: () => spoolsFn({ data: { projectId } }),
    enabled: expanded,
  });
  const assignedSpools = (spoolsQ.data?.spools ?? []).filter(
    (s) => s.assignedPlanId === dp.id,
  );
  const availableSpools = (spoolsQ.data?.spools ?? []).filter(
    (s) => !s.assignedPlanId,
  );
  const hasPhysical = assignedSpools.length > 0;
  const physicalCapacity = assignedSpools.reduce((a, s) => a + s.currentLengthM, 0);

  async function addSpool(spoolId: string) {
    try {
      await assignSpFn({ data: { projectId, dayPlanId: dp.id, spoolId } });
      qc.invalidateQueries({ queryKey: ["plan-spools", projectId] });
      qc.invalidateQueries({ queryKey: ["day-plans", projectId, dp.floorPlanId] });
      toast.success("Spulka přiřazena");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function removeSpool(spoolId: string) {
    try {
      await unassignSpFn({ data: { spoolId } });
      qc.invalidateQueries({ queryKey: ["plan-spools", projectId] });
      qc.invalidateQueries({ queryKey: ["day-plans", projectId, dp.floorPlanId] });
      toast.success("Spulka odebrána");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }


  function patchBase() {
    return {
      id: dp.id,
      name: dp.name,
      sortOrder: dp.sortOrder,
      spoolCount: dp.spoolCount,
      spoolLengthM: dp.spoolLengthM,
    };
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${projectId}/${dp.id}/${crypto.randomUUID()}.${ext}`;
        const up = await supabase.storage
          .from("pull-day-plan-photos")
          .upload(path, file, { cacheControl: "3600", upsert: false });
        if (up.error) throw new Error(up.error.message);
        await addPhotoFn({
          data: { projectId, dayPlanId: dp.id, storagePath: path, caption: null },
        });
      }
      qc.invalidateQueries({ queryKey: ["day-plan-photos", dp.id] });
      qc.invalidateQueries({ queryKey: ["day-plans", projectId, dp.floorPlanId] });
      toast.success("Fotky nahrány");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="rounded-sm border border-border p-2">
      <div className="mb-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-sm p-1 hover:bg-muted"
          aria-label={expanded ? "Sbalit" : "Rozbalit"}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <Input
          value={dp.name}
          onChange={(e) => onUpdate({ ...patchBase(), name: e.target.value })}
          className="h-7 text-xs"
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDelete(dp.id)}
          className="h-7 w-7 p-0 text-destructive"
          title="Smazat"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px]">
        <span className={`rounded-sm px-1.5 py-0.5 font-mono ${PRIORITY_COLOR[dp.priority] ?? "bg-muted"}`}>
          {PRIORITY_LABEL[dp.priority] ?? dp.priority}
        </span>
        <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-muted-foreground">
          {STATUS_LABEL[dp.status] ?? dp.status}
        </span>
        {dp.plannedDate && (
          <span className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-muted-foreground">
            {dp.plannedDate}
          </span>
        )}
        {dp.photoCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 font-mono text-muted-foreground">
            <Camera className="h-3 w-3" /> {dp.photoCount}
          </span>
        )}
      </div>

      {!hasPhysical && (
        <div className="mb-2 grid grid-cols-2 gap-2">
          <label className="text-[10px] text-muted-foreground">
            Cívek
            <Input
              type="number"
              min={1}
              max={20}
              value={dp.spoolCount}
              onChange={(e) =>
                onUpdate({ ...patchBase(), spoolCount: Math.max(1, Number(e.target.value) || 1) })
              }
              className="h-7 text-xs font-mono"
            />
          </label>
          <label className="text-[10px] text-muted-foreground">
            Metry/cívka
            <Input
              type="number"
              min={1}
              value={dp.spoolLengthM}
              onChange={(e) =>
                onUpdate({ ...patchBase(), spoolLengthM: Math.max(1, Number(e.target.value) || 1) })
              }
              className="h-7 text-xs font-mono"
            />
          </label>
        </div>
      )}


      {expanded && (
        <div className="mb-2 space-y-2 rounded-sm border border-dashed border-border bg-muted/30 p-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] text-muted-foreground">
              Termín
              <Input
                type="date"
                value={dp.plannedDate ?? ""}
                onChange={(e) =>
                  onUpdate({ ...patchBase(), plannedDate: e.target.value || null })
                }
                className="h-7 text-xs font-mono"
              />
            </label>
            <label className="text-[10px] text-muted-foreground">
              Přiřazen
              <Select
                value={dp.assignedTo ?? "__none"}
                onValueChange={(v) =>
                  onUpdate({ ...patchBase(), assignedTo: v === "__none" ? null : v })
                }
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue placeholder="Nikomu" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Nikomu</SelectItem>
                  {(members.data ?? []).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name || m.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="text-[10px] text-muted-foreground">
              Priorita
              <Select
                value={dp.priority}
                onValueChange={(v) => onUpdate({ ...patchBase(), priority: v })}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Nízká</SelectItem>
                  <SelectItem value="NORMAL">Normální</SelectItem>
                  <SelectItem value="HIGH">Vysoká</SelectItem>
                  <SelectItem value="URGENT">Kritická</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="text-[10px] text-muted-foreground">
              Stav
              <Select
                value={dp.status}
                onValueChange={(v) => onUpdate({ ...patchBase(), status: v })}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PLANNED">Naplánováno</SelectItem>
                  <SelectItem value="IN_PROGRESS">Probíhá</SelectItem>
                  <SelectItem value="DONE">Hotovo</SelectItem>
                  <SelectItem value="CANCELLED">Zrušeno</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>

          <label className="block text-[10px] text-muted-foreground">
            Poznámka
            <Textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              onBlur={() => {
                if ((notesDraft || null) !== (dp.notes ?? null)) {
                  onUpdate({ ...patchBase(), notes: notesDraft || null });
                }
              }}
              placeholder="Doplňující informace, riziko, materiál…"
              rows={3}
              className="mt-1 text-xs"
            />
          </label>

          {/* Fyzické spulky přiřazené k tomuto plánu */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Fyzické spulky
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">
                {assignedSpools.length > 0
                  ? `${physicalCapacity.toFixed(0)} m k dispozici`
                  : "Vyberte spulky ze skladu"}
              </div>
            </div>
            <div className="mb-1 flex flex-wrap gap-1">
              {assignedSpools.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => removeSpool(s.id)}
                  title="Odebrat z plánu"
                  className="inline-flex items-center gap-1 rounded-sm border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] hover:bg-destructive/10 hover:text-destructive"
                >
                  {s.serialNo}
                  {s.cableTypeCode && (
                    <span className="text-muted-foreground">· {s.cableTypeCode}</span>
                  )}
                  <span className="text-muted-foreground">
                    · {s.currentLengthM.toFixed(0)} m
                  </span>
                  <X className="h-3 w-3" />
                </button>
              ))}
              {assignedSpools.length === 0 && (
                <span className="text-[10px] text-muted-foreground">
                  Zatím žádná spulka.
                </span>
              )}
            </div>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) addSpool(e.target.value);
                e.target.value = "";
              }}
              className="w-full rounded-sm border border-border bg-background px-2 py-1 text-xs"
            >
              <option value="">+ přidat spulku ze skladu…</option>
              {availableSpools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.serialNo}
                  {s.cableTypeCode ? ` · ${s.cableTypeCode}` : ""} · {s.currentLengthM.toFixed(0)} m
                </option>
              ))}
            </select>
            {availableSpools.length === 0 && assignedSpools.length === 0 && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                Žádné volné spulky. Přidej je v záložce Fyzické spulky.
              </p>
            )}
          </div>



          <div>
            <div className="mb-1 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Fotky
              </div>
              <div className="flex items-center gap-1">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 gap-1 text-[10px]"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  <Camera className="h-3 w-3" />
                  {uploading ? "Nahrávám…" : "Přidat"}
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {(photos.data ?? []).map((p) => (
                <div key={p.id} className="group relative aspect-square overflow-hidden rounded-sm border border-border">
                  <img src={p.url} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={async () => {
                      await delPhotoFn({ data: { id: p.id } });
                      qc.invalidateQueries({ queryKey: ["day-plan-photos", dp.id] });
                      qc.invalidateQueries({ queryKey: ["day-plans", projectId, dp.floorPlanId] });
                    }}
                    className="absolute right-0.5 top-0.5 rounded-sm bg-background/80 p-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                    title="Smazat fotku"
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </button>
                </div>
              ))}
              {(photos.data?.length ?? 0) === 0 && !photos.isLoading && (
                <div className="col-span-4 rounded-sm border border-dashed border-border p-3 text-center text-[10px] text-muted-foreground">
                  Zatím žádné fotky.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mb-2 text-[10px] font-mono text-muted-foreground">
        Kapacita: {(hasPhysical ? physicalCapacity : virtualCapacity).toLocaleString("cs-CZ")} m
        {hasPhysical && (
          <span className="ml-1 text-primary">
            · {assignedSpools.length} fyz. spulek
          </span>
        )}
        {" "}· Kabelů: {cables.length}
      </div>
      <div className="mb-2 flex flex-wrap gap-1">
        {cables.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onAssign(c.id, null)}
            title="Odebrat z bloku"
            className="rounded-sm border border-border bg-muted/40 px-2 py-0.5 font-mono text-[10px] hover:bg-destructive/10 hover:text-destructive"
          >
            {c.code} ×
          </button>
        ))}
        {cables.length === 0 && (
          <span className="text-[10px] text-muted-foreground">Žádný kabel.</span>
        )}
      </div>
      <select
        value=""
        onChange={(e) => {
          if (e.target.value) onAssign(e.target.value, dp.id);
        }}
        className="w-full rounded-sm border border-border bg-background px-2 py-1 text-xs"
      >
        <option value="">+ přidat kabel…</option>
        {unassigned.map((b) => (
          <option key={b.id} value={b.id}>
            {b.code}
          </option>
        ))}
      </select>
    </div>
  );
}

const BUNDLE_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#0ea5e9",
  "#a855f7",
  "#ec4899",
];

function MeteragePanel({ projectId, floorPlanId }: { projectId: string; floorPlanId: string }) {
  const qc = useQueryClient();
  const meterageFn = useServerFn(getPlanMeterage);
  const bundleFn = useServerFn(setPlanCableBundle);
  const assignFpSpoolFn = useServerFn(assignSpoolToFloorPlan);
  const unassignFpSpoolFn = useServerFn(unassignSpoolFromFloorPlan);
  const [selected, setSelected] = useState<Record<string, Set<string>>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showCables, setShowCables] = useState(false);
  const [spoolPickerOpen, setSpoolPickerOpen] = useState(false);
  const [spoolFilter, setSpoolFilter] = useState("");

  const q = useQuery({
    queryKey: ["plan-meterage", projectId, floorPlanId],
    queryFn: () => meterageFn({ data: { projectId, floorPlanId } }),
  });

  const plans = q.data?.plans ?? [];
  const overall = q.data?.overall;

  function toggleSel(planId: string, cableId: string) {
    setSelected((prev) => {
      const s = new Set(prev[planId] ?? []);
      if (s.has(cableId)) s.delete(cableId);
      else s.add(cableId);
      return { ...prev, [planId]: s };
    });
  }

  async function makeBundle(planId: string) {
    const ids = Array.from(selected[planId] ?? []);
    if (ids.length < 2) {
      toast.error("Vyberte alespoň 2 kabely.");
      return;
    }
    const key = `B-${Date.now().toString(36)}`;
    const color = BUNDLE_COLORS[Math.floor(Math.random() * BUNDLE_COLORS.length)];
    try {
      await bundleFn({ data: { projectId, dayPlanId: planId, cableIds: ids, bundleKey: key, color } });
      toast.success(`Svazek vytvořen (${ids.length} kabelů)`);
      setSelected((prev) => ({ ...prev, [planId]: new Set() }));
      qc.invalidateQueries({ queryKey: ["plan-meterage", projectId, floorPlanId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    }
  }

  async function clearBundle(planId: string, cableId: string) {
    try {
      await bundleFn({ data: { projectId, dayPlanId: planId, cableIds: [cableId], bundleKey: null } });
      qc.invalidateQueries({ queryKey: ["plan-meterage", projectId, floorPlanId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    }
  }

  async function assignFpSpool(spoolId: string) {
    try {
      await assignFpSpoolFn({ data: { projectId, floorPlanId, spoolId } });
      qc.invalidateQueries({ queryKey: ["plan-meterage", projectId, floorPlanId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba přiřazení");
    }
  }

  async function unassignFpSpool(spoolId: string) {
    try {
      await unassignFpSpoolFn({ data: { floorPlanId, spoolId } });
      qc.invalidateQueries({ queryKey: ["plan-meterage", projectId, floorPlanId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba");
    }
  }

  if (q.isLoading) {
    return <div className="rounded-sm border border-border p-3 text-xs text-muted-foreground">Načítám metráž…</div>;
  }

  const overallDeficit = (overall?.deficitM ?? 0) > 0;
  const filteredAvailable = (overall?.availableSpools ?? []).filter((s: any) => {
    const f = spoolFilter.trim().toLowerCase();
    if (!f) return true;
    return (
      (s.serial ?? "").toLowerCase().includes(f) ||
      (s.cableTypeCode ?? "").toLowerCase().includes(f)
    );
  });

  return (
    <div className="space-y-3">
      {/* ============= FLOOR-PLAN OVERALL ============= */}
      {overall && (
        <div className="rounded-sm border border-border">
          <div className="border-b border-border bg-muted/40 px-3 py-2 text-sm font-semibold">
            Celková metráž plánu
          </div>
          <div className="space-y-3 p-3">
            {!overall.hasCalibration && (
              <div className="rounded-sm border border-destructive/50 bg-destructive/10 p-2 text-[11px] text-destructive">
                Plán není zkalibrován — délky nelze spolehlivě spočítat. Nakalibrujte v záložce „1 · Kalibrace".
              </div>
            )}
            {overall.missingCount > 0 && (
              <div className="rounded-sm border border-amber-500/50 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-400">
                {overall.missingCount} kabelů nemá spočítanou trasu (chybí endpoint/port/racek nebo trasa).
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <div className="rounded-sm border border-border p-2">
                <div className="text-[10px] text-muted-foreground">Kabelů celkem</div>
                <div className="font-mono text-lg font-semibold">{overall.cableCount}</div>
              </div>
              <div className="rounded-sm border border-border p-2">
                <div className="text-[10px] text-muted-foreground">Trasy (z kalibrace)</div>
                <div className="font-mono text-lg font-semibold">{overall.routeM.toFixed(1)} m</div>
              </div>
              <div className="rounded-sm border border-border p-2">
                <div className="text-[10px] text-muted-foreground">Rezervy (nastavení)</div>
                <div className="font-mono text-lg font-semibold">{overall.reserveM.toFixed(1)} m</div>
              </div>
              <div className="rounded-sm border-2 border-primary/60 bg-primary/5 p-2">
                <div className="text-[10px] text-muted-foreground">Metráž celkem</div>
                <div className="font-mono text-lg font-bold text-primary">{overall.totalM.toFixed(1)} m</div>
              </div>
            </div>

            {/* Coverage by type */}
            {overall.coverage.length > 0 && (
              <div className="rounded-sm border border-border">
                <div className="border-b border-border bg-muted/30 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Pokrytí dle typu kabelu
                </div>
                <div className="divide-y divide-border">
                  {overall.coverage.map((c: any, idx: number) => (
                    <div key={idx} className="grid grid-cols-4 gap-2 px-2 py-1.5 text-[11px] font-mono">
                      <span className="font-semibold">{c.typeCode ?? "— bez typu —"}</span>
                      <span className="text-muted-foreground">{c.cableCount} kab.</span>
                      <span>
                        {c.neededM.toFixed(0)} / {c.availableM.toFixed(0)} m
                      </span>
                      <span className={c.deficitM > 0 ? "text-destructive text-right" : "text-emerald-600 dark:text-emerald-400 text-right"}>
                        {c.deficitM > 0 ? `-${c.deficitM.toFixed(0)} m` : "OK"}
                      </span>
                    </div>
                  ))}
                </div>
                <div className={`border-t border-border px-2 py-1.5 text-[11px] font-mono ${overallDeficit ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"}`}>
                  {overallDeficit
                    ? `Deficit celkem: ${overall.deficitM.toFixed(1)} m`
                    : `Rezerva celkem: +${(overall.availableM - overall.totalM).toFixed(1)} m`}
                </div>
              </div>
            )}

            {/* Assigned spools */}
            <div className="rounded-sm border border-border">
              <div className="flex items-center justify-between border-b border-border bg-muted/30 px-2 py-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Přiřazené špulky ({overall.assignedSpools.length})
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10px]"
                  onClick={() => setSpoolPickerOpen((v) => !v)}
                >
                  {spoolPickerOpen ? "Zavřít" : "+ Přiřadit špulky"}
                </Button>
              </div>
              {overall.assignedSpools.length === 0 ? (
                <div className="p-3 text-center text-[11px] text-muted-foreground">
                  Zatím žádná špulka. Přiřaďte fyzické špulky ze skladu pomocí tlačítka výše.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {overall.assignedSpools.map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px] font-mono">
                      <span className="font-semibold">#{s.serial}</span>
                      <span className="text-muted-foreground">{s.cableTypeCode ?? "—"}</span>
                      <span>{s.currentM.toFixed(0)} / {s.initialM.toFixed(0)} m</span>
                      <button
                        type="button"
                        className="rounded-sm border border-border px-1.5 py-0.5 text-[10px] hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => unassignFpSpool(s.id)}
                      >
                        Odebrat
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {spoolPickerOpen && (
                <div className="border-t border-border p-2">
                  <Input
                    placeholder="Hledat podle sériového čísla nebo typu…"
                    value={spoolFilter}
                    onChange={(e) => setSpoolFilter(e.target.value)}
                    className="mb-2 h-7 text-[11px]"
                  />
                  {filteredAvailable.length === 0 ? (
                    <div className="text-center text-[11px] text-muted-foreground">
                      Žádné volné špulky.
                    </div>
                  ) : (
                    <div className="max-h-60 divide-y divide-border overflow-y-auto rounded-sm border border-border">
                      {filteredAvailable.map((s: any) => (
                        <button
                          key={s.id}
                          type="button"
                          className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-[11px] font-mono hover:bg-muted/40"
                          onClick={() => assignFpSpool(s.id)}
                        >
                          <span className="font-semibold">#{s.serial}</span>
                          <span className="text-muted-foreground">{s.cableTypeCode ?? "—"}</span>
                          <span>{s.currentM.toFixed(0)} m</span>
                          <span className="text-primary">+ přidat</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Cables list toggle */}
            <div>
              <button
                type="button"
                onClick={() => setShowCables((v) => !v)}
                className="flex w-full items-center justify-between gap-2 rounded-sm border border-border bg-muted/30 px-2 py-1.5 text-[11px]"
              >
                <span className="font-semibold">Seznam všech kabelů ({overall.cableCount})</span>
                {showCables ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              {showCables && (
                <div className="mt-2 overflow-x-auto rounded-sm border border-border">
                  <table className="w-full text-[10px]">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1 text-left">Kód</th>
                        <th className="px-2 py-1 text-left">Typ</th>
                        <th className="px-2 py-1 text-left">Trasa</th>
                        <th className="px-2 py-1 text-right">Trasa m</th>
                        <th className="px-2 py-1 text-right">Rezerva</th>
                        <th className="px-2 py-1 text-right font-semibold">Celkem</th>
                        <th className="px-2 py-1 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {overall.cables.map((c: any) => {
                        const routeLen = c.lengthM != null && c.reserveM != null ? c.lengthM - c.reserveM : null;
                        return (
                          <tr key={c.cableId} className="hover:bg-muted/30">
                            <td className="px-2 py-1 font-mono font-semibold">{c.code}</td>
                            <td className="px-2 py-1 font-mono">{c.cableTypeCode ?? "—"}</td>
                            <td className="px-2 py-1 truncate max-w-[180px]">
                              {c.fromLabel} → {c.toLabel}
                            </td>
                            <td className="px-2 py-1 text-right font-mono">
                              {routeLen != null ? routeLen.toFixed(1) : "—"}
                            </td>
                            <td className="px-2 py-1 text-right font-mono">{c.reserveM.toFixed(1)}</td>
                            <td className="px-2 py-1 text-right font-mono font-semibold">
                              {c.totalM != null ? c.totalM.toFixed(1) : "—"}
                            </td>
                            <td className="px-2 py-1 font-mono">
                              <span className={c.note ? "text-amber-600 dark:text-amber-400" : ""} title={c.note ?? undefined}>
                                {c.status}
                                {c.note ? " ⚠" : ""}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============= PER-DAY-PLAN BLOCKS ============= */}
      {plans.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">
          Zatím žádný denní plán tahání. Vytvořte jej v záložce „5 · Zadat plán" pro rozdělení metráže na jednotlivá kola.
        </div>
      ) : null}
      {plans.map((p: any) => {
        const isOpen = expanded[p.id] ?? true;
        const sum = p.summary;
        const deficit = sum.deficitM > 0;
        const sel = selected[p.id] ?? new Set();
        return (
          <div key={p.id} className="rounded-sm border border-border">
            <button
              type="button"
              onClick={() => setExpanded((prev) => ({ ...prev, [p.id]: !isOpen }))}
              className="flex w-full items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2 text-left"
            >
              <div className="flex items-center gap-2">
                {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <span className="font-semibold text-sm">{p.name}</span>
                {p.plannedDate && (
                  <span className="text-[10px] text-muted-foreground">{p.plannedDate}</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono">
                <span>{sum.cableCount} kab.</span>
                <span>{sum.bundleCount} svazků</span>
                <span
                  className={
                    deficit
                      ? "rounded-sm bg-destructive/15 px-1.5 py-0.5 text-destructive"
                      : "rounded-sm bg-emerald-500/15 px-1.5 py-0.5 text-emerald-600 dark:text-emerald-400"
                  }
                >
                  {sum.neededM.toFixed(0)} m / {sum.availableM.toFixed(0)} m
                </span>
              </div>
            </button>
            {isOpen && (
              <div className="space-y-2 p-3">
                {/* Summary card */}
                <div className="grid grid-cols-2 gap-2 text-[10px] md:grid-cols-4">
                  <div className="rounded-sm border border-border p-2">
                    <div className="text-muted-foreground">Potřeba (min)</div>
                    <div className="font-mono text-sm">{sum.neededM.toFixed(1)} m</div>
                  </div>
                  <div className="rounded-sm border border-border p-2">
                    <div className="text-muted-foreground">Materiál celkem</div>
                    <div className="font-mono text-sm">{sum.materialTotalM.toFixed(1)} m</div>
                  </div>
                  <div className="rounded-sm border border-border p-2">
                    <div className="text-muted-foreground">Cívky ({sum.spoolCount})</div>
                    <div className="font-mono text-sm">{sum.availableM.toFixed(1)} m</div>
                  </div>
                  <div className={`rounded-sm border p-2 ${deficit ? "border-destructive/50 bg-destructive/10" : "border-emerald-500/40 bg-emerald-500/5"}`}>
                    <div className="text-muted-foreground">{deficit ? "Deficit" : "Rezerva"}</div>
                    <div className="font-mono text-sm">
                      {deficit
                        ? `-${sum.deficitM.toFixed(1)} m`
                        : `+${(sum.availableM - sum.neededM).toFixed(1)} m`}
                    </div>
                  </div>
                </div>

                {/* Coverage by type */}
                {sum.coverage.length > 0 && (
                  <div className="rounded-sm border border-border">
                    <div className="border-b border-border bg-muted/30 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      Pokrytí dle typu kabelu
                    </div>
                    <div className="divide-y divide-border">
                      {sum.coverage.map((c: any, idx: number) => (
                        <div key={idx} className="flex items-center justify-between gap-2 px-2 py-1 text-[10px] font-mono">
                          <span>{c.typeCode ?? "— bez typu —"}</span>
                          <span className="text-muted-foreground">
                            {c.neededM.toFixed(0)} m potřeba / {c.availableM.toFixed(0)} m spulek
                          </span>
                          <span className={c.deficitM > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}>
                            {c.deficitM > 0 ? `-${c.deficitM.toFixed(0)} m` : "OK"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cables table */}
                {p.cables.length === 0 ? (
                  <div className="rounded-sm border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">
                    Zatím žádný kabel není přiřazen k tomuto plánu (záložka „5 · Zadat plán").
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] text-muted-foreground">
                        {sel.size > 0 ? `${sel.size} vybráno` : "Zaškrtnutím vytvoříte svazek souběžných kabelů"}
                      </div>
                      {sel.size >= 2 && (
                        <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => makeBundle(p.id)}>
                          Označit jako svazek
                        </Button>
                      )}
                    </div>
                    <div className="overflow-x-auto rounded-sm border border-border">
                      <table className="w-full text-[10px]">
                        <thead className="bg-muted/40 text-muted-foreground">
                          <tr>
                            <th className="px-2 py-1 text-left"></th>
                            <th className="px-2 py-1 text-left">Kód</th>
                            <th className="px-2 py-1 text-left">Typ</th>
                            <th className="px-2 py-1 text-left">Trasa</th>
                            <th className="px-2 py-1 text-right">Trasa m</th>
                            <th className="px-2 py-1 text-right">Rezerva</th>
                            <th className="px-2 py-1 text-right font-semibold">Celkem</th>
                            <th className="px-2 py-1 text-left">Svazek</th>
                            <th className="px-2 py-1 text-left">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {p.cables.map((c: any) => {
                            const routeLen = c.lengthM != null && c.reserveM != null ? c.lengthM - c.reserveM : null;
                            return (
                              <tr key={c.cableId} className="hover:bg-muted/30">
                                <td className="px-2 py-1">
                                  <input
                                    type="checkbox"
                                    checked={sel.has(c.cableId)}
                                    onChange={() => toggleSel(p.id, c.cableId)}
                                  />
                                </td>
                                <td className="px-2 py-1 font-mono font-semibold">{c.code}</td>
                                <td className="px-2 py-1 font-mono">{c.cableTypeCode ?? "—"}</td>
                                <td className="px-2 py-1 truncate max-w-[160px]">
                                  {c.fromLabel} → {c.toLabel}
                                </td>
                                <td className="px-2 py-1 text-right font-mono">
                                  {routeLen != null ? routeLen.toFixed(1) : "—"}
                                </td>
                                <td className="px-2 py-1 text-right font-mono">{c.reserveM.toFixed(1)}</td>
                                <td className="px-2 py-1 text-right font-mono font-semibold">
                                  {c.totalM != null ? c.totalM.toFixed(1) : "—"}
                                </td>
                                <td className="px-2 py-1">
                                  {c.bundleKey ? (
                                    <button
                                      type="button"
                                      onClick={() => clearBundle(p.id, c.cableId)}
                                      className="inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono hover:bg-destructive/10 hover:text-destructive"
                                      title="Odebrat ze svazku"
                                      style={{ borderColor: c.bundleColor ?? undefined, color: c.bundleColor ?? undefined }}
                                    >
                                      <span
                                        className="h-2 w-2 rounded-full"
                                        style={{ background: c.bundleColor ?? "hsl(var(--foreground))" }}
                                      />
                                      {c.bundleKey.slice(-4)}
                                    </button>
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </td>
                                <td className="px-2 py-1 font-mono">
                                  <span className={c.note ? "text-amber-600 dark:text-amber-400" : ""} title={c.note ?? undefined}>
                                    {c.status}
                                    {c.note ? " ⚠" : ""}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
