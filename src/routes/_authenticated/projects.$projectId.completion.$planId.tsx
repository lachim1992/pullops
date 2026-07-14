import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2, Layers, Server, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  getCompletionPlan,
  setEndpointCompletionStatus,
  setPatchPanelCompletionStatus,
  unmarkPlanReadyForCompletion,
  ENDPOINT_STATUSES,
  PANEL_STATUSES,
  type EndpointCompletionStatus,
  type PanelCompletionStatus,
} from "@/lib/completionPlans.functions";
import { getMyProjectCapabilities } from "@/lib/capabilities.functions";
import { endpointKindInfo } from "@/lib/endpointKinds";
import { cn } from "@/lib/utils";
import { PlanCanvasSurface } from "@/components/plan-canvas-surface";

export const Route = createFileRoute("/_authenticated/projects/$projectId/completion/$planId")({
  component: CompletionPlanEditor,
});

const EP_LABEL: Record<EndpointCompletionStatus, string> = {
  PENDING: "Čeká",
  PULLED: "Protaženo",
  TERMINATED: "Zakončeno",
  TESTED: "Otestováno",
  DONE: "Hotovo",
};
const EP_COLOR: Record<EndpointCompletionStatus, string> = {
  PENDING: "hsl(0 0% 45%)",
  PULLED: "hsl(45 90% 55%)",
  TERMINATED: "hsl(25 85% 55%)",
  TESTED: "hsl(210 85% 55%)",
  DONE: "hsl(140 60% 45%)",
};
const PANEL_LABEL: Record<PanelCompletionStatus, string> = {
  PENDING: "Čeká",
  WIRED: "Zapojeno",
  LABELED: "Popsáno",
  MEASURED: "Proměřeno",
  DONE: "Hotovo",
};

type Tab = "endpoints" | "racks";

function CompletionPlanEditor() {
  const { projectId, planId } = Route.useParams();
  const qc = useQueryClient();

  const dataFn = useServerFn(getCompletionPlan);
  const setEpFn = useServerFn(setEndpointCompletionStatus);
  const setPpFn = useServerFn(setPatchPanelCompletionStatus);
  const unmarkFn = useServerFn(unmarkPlanReadyForCompletion);
  const capsFn = useServerFn(getMyProjectCapabilities);

  const q = useQuery({
    queryKey: ["completion-plan", planId],
    queryFn: () => dataFn({ data: { planId } }),
  });
  const caps = useQuery({
    queryKey: ["me", "project-caps", projectId],
    queryFn: () => capsFn({ data: { projectId } }),
  });
  const canManage = caps.data?.canManage ?? false;

  const [tab, setTab] = useState<Tab>("endpoints");
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(null);

  const endpoints = q.data?.endpoints ?? [];
  const panels = q.data?.panels ?? [];
  const cables = q.data?.cables ?? [];
  const plan = q.data?.plan;
  const fp = q.data?.floorPlan;

  const cablesByEndpoint = useMemo(() => {
    const m = new Map<string, typeof cables>();
    for (const c of cables) {
      for (const eid of [c.fromEndpointId, c.toEndpointId]) {
        if (!eid) continue;
        const arr = m.get(eid) ?? [];
        arr.push(c);
        m.set(eid, arr);
      }
    }
    return m;
  }, [cables]);

  const doneCount = endpoints.filter((e) => e.completionStatus === "DONE").length;

  async function setEpStatus(id: string, status: EndpointCompletionStatus) {
    try {
      await setEpFn({ data: { endpointId: id, status } });
      await qc.invalidateQueries({ queryKey: ["completion-plan", planId] });
      toast.success(`${EP_LABEL[status]}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chyba");
    }
  }
  async function setPpStatus(id: string, status: PanelCompletionStatus) {
    try {
      await setPpFn({ data: { panelId: id, status } });
      await qc.invalidateQueries({ queryKey: ["completion-plan", planId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chyba");
    }
  }
  async function unmark() {
    try {
      await unmarkFn({ data: { planId } });
      toast.success("Plán vrácen z kompletace");
      await qc.invalidateQueries({ queryKey: ["completion-plan", planId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chyba");
    }
  }

  return (
    <AppShell projectId={projectId}>
      <div className="animate-fade-in space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Button variant="outline" size="sm" asChild>
              <Link to="/projects/$projectId/completion" params={{ projectId }}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Zpět
              </Link>
            </Button>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Kompletace / {fp?.name ?? "—"}
              </div>
              <h1 className="mt-1 font-mono text-xl font-bold uppercase">{plan?.name ?? "…"}</h1>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>{endpoints.length} endpointů</span>
                <span>·</span>
                <span className="font-mono">{doneCount}/{endpoints.length} hotovo</span>
                <span>·</span>
                <span>{panels.length} patch panelů</span>
              </div>
            </div>
          </div>
          {canManage && (
            <Button variant="outline" size="sm" onClick={unmark}>
              <Undo2 className="mr-2 h-4 w-4" /> Vrátit z kompletace
            </Button>
          )}
        </header>

        <div className="flex gap-2 border-b border-border">
          <TabBtn active={tab === "endpoints"} onClick={() => setTab("endpoints")}>
            <CheckCircle2 className="mr-2 h-4 w-4" /> Endpointy
          </TabBtn>
          <TabBtn active={tab === "racks"} onClick={() => setTab("racks")}>
            <Server className="mr-2 h-4 w-4" /> Racky
          </TabBtn>
        </div>

        {tab === "endpoints" && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section className="overflow-hidden rounded-sm border border-border bg-card">
              <MiniMap
                imageUrl={fp?.documentUrl ?? null}
                mimeType={fp?.mimeType ?? null}
                endpoints={endpoints}
                cables={cables}
                selectedEndpointId={selectedEndpointId}
                onSelect={setSelectedEndpointId}
                onSetStatus={setEpStatus}
              />
            </section>

            <aside className="space-y-2">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Seznam endpointů
              </div>
              {endpoints.length === 0 && (
                <div className="rounded-sm border border-dashed p-4 text-center text-xs text-muted-foreground">
                  Plán nemá žádné endpointy.
                </div>
              )}
              <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                {endpoints.map((ep) => (
                  <EndpointCard
                    key={ep.id}
                    endpoint={ep}
                    cables={cablesByEndpoint.get(ep.id) ?? []}
                    selected={selectedEndpointId === ep.id}
                    onSelect={() => setSelectedEndpointId(ep.id === selectedEndpointId ? null : ep.id)}
                    onSetStatus={(s) => setEpStatus(ep.id, s)}
                  />
                ))}
              </div>
            </aside>
          </div>
        )}

        {tab === "racks" && (
          <section className="space-y-2">
            {!canManage && (
              <div className="rounded-sm border border-dashed p-3 text-center text-xs text-muted-foreground">
                Kompletaci racků mohou aktualizovat jen technici a projektoví manažeři. Můžeš je pouze prohlížet.
              </div>
            )}
            {panels.length === 0 && (
              <div className="rounded-sm border border-dashed p-6 text-center text-xs text-muted-foreground">
                Na patře plánu nejsou žádné patch panely.
              </div>
            )}
            <div className="grid gap-2 md:grid-cols-2">
              {panels.map((p) => (
                <PanelCard
                  key={p.id}
                  panel={p}
                  canEdit={canManage}
                  onSetStatus={(s) => setPpStatus(p.id, s)}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px flex items-center border-b-2 px-4 py-2 font-mono text-sm uppercase transition-colors",
        active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function MiniMap({
  imageUrl,
  mimeType,
  endpoints,
  cables,
  selectedEndpointId,
  onSelect,
  onSetStatus,
}: {
  imageUrl: string | null;
  mimeType: string | null;
  endpoints: Array<{ id: string; code: string; kind: string | null; normX: number; normY: number; completionStatus: EndpointCompletionStatus }>;
  cables: Array<{ id: string; code: string; status: string; fromEndpointId: string | null; toEndpointId: string | null }>;
  selectedEndpointId: string | null;
  onSelect: (id: string | null) => void;
  onSetStatus: (endpointId: string, status: EndpointCompletionStatus) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ startX: number; startY: number; tx0: number; ty0: number } | null>(null);
  const [view, setView] = useState({ tx: 0, ty: 0, s: 1 });
  const selectedEndpoint = endpoints.find((ep) => ep.id === selectedEndpointId) ?? null;
  const selectedCables = selectedEndpoint
    ? cables.filter((c) => c.fromEndpointId === selectedEndpoint.id || c.toEndpointId === selectedEndpoint.id)
    : [];

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = Math.exp(-(e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY) * 0.0018);
      setView((v) => {
        const ns = Math.min(12, Math.max(0.5, v.s * factor));
        const k = ns / v.s;
        return { tx: mx - k * (mx - v.tx), ty: my - k * (my - v.ty), s: ns };
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 1) return;
    const target = event.target as SVGElement | HTMLElement;
    if (target instanceof SVGElement && target.tagName !== "svg") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = { startX: event.clientX, startY: event.clientY, tx0: view.tx, ty0: view.ty };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!panRef.current) return;
    setView((v) => ({
      ...v,
      tx: panRef.current!.tx0 + event.clientX - panRef.current!.startX,
      ty: panRef.current!.ty0 + event.clientY - panRef.current!.startY,
    }));
  };
  const onPointerUp = () => {
    panRef.current = null;
  };
  const zoomBy = (factor: number) => setView((v) => ({ ...v, s: Math.min(12, Math.max(0.5, v.s * factor)) }));

  return (
    <div
      ref={containerRef}
      className="field-plan-viewer relative h-[calc(100vh-230px)] min-h-[620px] w-full touch-none select-none bg-muted"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <PlanCanvasSurface
        documentUrl={imageUrl}
        mimeType={mimeType}
        title="Plán"
        empty={<Layers className="h-10 w-10" />}
        fullscreenTargetRef={containerRef}
        contentClassName="origin-top-left"
        contentStyle={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})` }}
        overlay={
          <>
            <div className="pointer-events-none absolute right-3 top-3 z-20 flex flex-col gap-1">
              <button type="button" onClick={() => zoomBy(1.2)} className="pointer-events-auto rounded-sm border border-border bg-background/90 px-2 py-1 font-mono text-xs shadow-sm">+</button>
              <button type="button" onClick={() => zoomBy(1 / 1.2)} className="pointer-events-auto rounded-sm border border-border bg-background/90 px-2 py-1 font-mono text-xs shadow-sm">−</button>
              <button type="button" onClick={() => setView({ tx: 0, ty: 0, s: 1 })} className="pointer-events-auto rounded-sm border border-border bg-background/90 px-2 py-1 font-mono text-[10px] shadow-sm">1:1</button>
              <div className="rounded-sm bg-background/80 px-1 py-0.5 text-center font-mono text-[10px] text-muted-foreground">{Math.round(view.s * 100)}%</div>
            </div>
            {selectedEndpoint && (
              <div className="pointer-events-auto absolute left-3 right-14 top-3 z-20 max-w-[520px] rounded-sm border-2 border-primary bg-card/95 p-3 shadow-xl backdrop-blur">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-base font-bold uppercase">{selectedEndpoint.code}</div>
                    <div className="text-xs text-muted-foreground">{selectedEndpoint.kind ? endpointKindInfo(selectedEndpoint.kind).label : "Endpoint"}</div>
                  </div>
                  <Badge variant="outline" className="font-mono text-[10px]">{EP_LABEL[selectedEndpoint.completionStatus]}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {ENDPOINT_STATUSES.map((status) => (
                    <Button key={status} size="sm" variant={status === selectedEndpoint.completionStatus ? "default" : "outline"} className="h-7 px-2 font-mono text-[10px]" onClick={() => onSetStatus(selectedEndpoint.id, status)}>
                      {EP_LABEL[status]}
                    </Button>
                  ))}
                </div>
                <div className="mt-2 max-h-32 overflow-y-auto rounded-sm border border-border/60 bg-muted/30 p-2">
                  <div className="mb-1 font-mono text-[10px] uppercase text-muted-foreground">Kabely v bodě ({selectedCables.length})</div>
                  {selectedCables.length === 0 && <div className="text-xs text-muted-foreground">Bez kabelů.</div>}
                  {selectedCables.map((c) => (
                    <div key={c.id} className="flex justify-between gap-3 text-[11px]">
                      <span className="font-mono">{c.code}</span>
                      <span className="font-mono text-muted-foreground">{c.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        }
      >
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {endpoints.map((ep) => {
          const kindColor = ep.kind ? endpointKindInfo(ep.kind).color : "hsl(0 0% 40%)";
          const doneColor = EP_COLOR[ep.completionStatus];
          const r = 0.014;
          const selected = ep.id === selectedEndpointId;
          return (
            <g key={ep.id} style={{ cursor: "pointer" }} onClick={() => onSelect(ep.id)}>
              {/* left half = kind color */}
              <path
                d={`M ${ep.normX - r} ${ep.normY} A ${r} ${r} 0 0 1 ${ep.normX + r} ${ep.normY} Z`}
                transform={`rotate(-90 ${ep.normX} ${ep.normY})`}
                fill={kindColor}
              />
              {/* right half = completion color */}
              <path
                d={`M ${ep.normX - r} ${ep.normY} A ${r} ${r} 0 0 1 ${ep.normX + r} ${ep.normY} Z`}
                transform={`rotate(90 ${ep.normX} ${ep.normY})`}
                fill={doneColor}
              />
              <circle
                cx={ep.normX}
                cy={ep.normY}
                r={r}
                fill="none"
                stroke={selected ? "hsl(45 100% 60%)" : "hsl(0 0% 0% / 0.5)"}
                strokeWidth={selected ? 0.004 : 0.002}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      </svg>
      </PlanCanvasSurface>
    </div>
  );
}

function EndpointCard({
  endpoint,
  cables,
  selected,
  onSelect,
  onSetStatus,
}: {
  endpoint: { id: string; code: string; kind: string | null; completionStatus: EndpointCompletionStatus };
  cables: Array<{ id: string; code: string; status: string }>;
  selected: boolean;
  onSelect: () => void;
  onSetStatus: (s: EndpointCompletionStatus) => void;
}) {
  const info = endpoint.kind ? endpointKindInfo(endpoint.kind) : null;
  return (
    <div
      className={cn(
        "rounded-sm border bg-card p-2.5 transition-colors",
        selected ? "border-accent" : "border-border hover:border-primary/40",
      )}
    >
      <button type="button" onClick={onSelect} className="flex w-full items-center justify-between gap-2 text-left">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: EP_COLOR[endpoint.completionStatus] }}
            />
            <span className="font-mono text-xs font-bold uppercase">{endpoint.code}</span>
            {info && <span className="text-[10px] text-muted-foreground">{info.label}</span>}
          </div>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">
          {EP_LABEL[endpoint.completionStatus]}
        </Badge>
      </button>
      {selected && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-1">
            {ENDPOINT_STATUSES.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={s === endpoint.completionStatus ? "default" : "outline"}
                className="h-7 px-2 font-mono text-[10px]"
                onClick={() => onSetStatus(s)}
              >
                {EP_LABEL[s]}
              </Button>
            ))}
          </div>
          {cables.length > 0 && (
            <div className="rounded-sm border border-border/60 bg-muted/30 p-2">
              <div className="mb-1 font-mono text-[10px] uppercase text-muted-foreground">Kabely</div>
              <div className="space-y-0.5">
                {cables.map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-[11px]">
                    <span className="font-mono">{c.code}</span>
                    <span className="font-mono text-muted-foreground">{c.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PanelCard({
  panel,
  canEdit,
  onSetStatus,
}: {
  panel: { id: string; code: string; name: string | null; portCount: number; completionStatus: PanelCompletionStatus };
  canEdit: boolean;
  onSetStatus: (s: PanelCompletionStatus) => void;
}) {
  return (
    <div className="rounded-sm border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="font-mono text-sm font-bold uppercase">{panel.code}</div>
          <div className="text-xs text-muted-foreground">
            {panel.name ?? "—"} · {panel.portCount} portů
          </div>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">{PANEL_LABEL[panel.completionStatus]}</Badge>
      </div>
      <div className="flex flex-wrap gap-1">
        {PANEL_STATUSES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={s === panel.completionStatus ? "default" : "outline"}
            className="h-7 px-2 font-mono text-[10px]"
            disabled={!canEdit}
            onClick={() => onSetStatus(s)}
          >
            {PANEL_LABEL[s]}
          </Button>
        ))}
      </div>
    </div>
  );
}
