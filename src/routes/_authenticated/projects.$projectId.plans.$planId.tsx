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
import { getFloorPlan, setCalibration } from "@/lib/floorPlans.functions";
import {
  createEndpoint,
  deleteEndpoint,
  listEndpoints,
} from "@/lib/endpoints.functions";
import {
  metersPerNormUnit,
  normDistance,
  type Calibration,
} from "@/lib/length";

export const Route = createFileRoute(
  "/_authenticated/projects/$projectId/plans/$planId",
)({
  head: () => ({
    meta: [{ title: "Editor plánu · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: PlanEditorPage,
});

type Mode = "calibrate" | "endpoint";

function PlanEditorPage() {
  const { projectId, planId } = useParams({
    from: "/_authenticated/projects/$projectId/plans/$planId",
  });
  const getPlanFn = useServerFn(getFloorPlan);
  const setCalFn = useServerFn(setCalibration);
  const listEpFn = useServerFn(listEndpoints);
  const createEpFn = useServerFn(createEndpoint);
  const deleteEpFn = useServerFn(deleteEndpoint);
  const qc = useQueryClient();

  const plan = useQuery({
    queryKey: ["plan", planId],
    queryFn: () => getPlanFn({ data: { id: planId } }),
  });
  const endpoints = useQuery({
    queryKey: ["endpoints", projectId, planId],
    queryFn: () => listEpFn({ data: { projectId, floorPlanId: planId } }),
  });

  const [mode, setMode] = useState<Mode>("endpoint");
  const [calA, setCalA] = useState<{ x: number; y: number } | null>(null);
  const [calB, setCalB] = useState<{ x: number; y: number } | null>(null);
  const [calDistance, setCalDistance] = useState<string>("");
  const [newEpCode, setNewEpCode] = useState("");
  const [newEpLabel, setNewEpLabel] = useState("");
  const [newEpKind, setNewEpKind] = useState<
    "WORKSTATION" | "AP" | "CAMERA" | "PATCH" | "OTHER"
  >("WORKSTATION");
  const [pendingPos, setPendingPos] = useState<{ x: number; y: number } | null>(null);
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

  function toNorm(evt: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = (evt.clientX - rect.left) / rect.width;
    const y = (evt.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }

  async function handleClick(evt: React.MouseEvent<SVGSVGElement>) {
    const pos = toNorm(evt);
    if (!pos) return;
    if (mode === "calibrate") {
      if (!calA) setCalA(pos);
      else if (!calB) setCalB(pos);
      else {
        setCalA(pos);
        setCalB(null);
      }
    } else {
      setPendingPos(pos);
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

  if (plan.isLoading) {
    return (
      <AppShell projectId={projectId}>
        <div className="text-muted-foreground">Načítám…</div>
      </AppShell>
    );
  }

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
            onClick={handleClick}
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
                  fill="hsl(var(--primary))"
                  stroke="white"
                  strokeWidth={0.002}
                />
              </g>
            ))}
            {pendingPos && (
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
          {mode === "calibrate" ? (
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
          ) : (
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
