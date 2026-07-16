import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CheckCircle2, ChevronDown, Layers, Ruler, Search, Server, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  getCompletionPlan,
  setCableMeasured,
  setCableCancelled,
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
  PLANNED: "Naplánováno",
  PULLED: "Protaženo",
  TERMINATED: "Zaterminováno",
  TESTED: "Otestováno",
  DONE: "Hotovo",
  CANCELLED: "Zrušeno",
};
const EP_COLOR: Record<EndpointCompletionStatus, string> = {
  PLANNED: "hsl(0 0% 45%)",
  PULLED: "hsl(45 90% 55%)",
  TERMINATED: "hsl(25 85% 55%)",
  TESTED: "hsl(210 85% 55%)",
  DONE: "hsl(140 60% 45%)",
  CANCELLED: "hsl(0 70% 45%)",
};
const PANEL_LABEL: Record<PanelCompletionStatus, string> = {
  PLANNED: "Naplánováno",
  WIRED: "Zapojeno + popsáno",
  MEASURED: "Proměřeno",
};

const MEASURED_STATUSES = new Set(["TERMINATED", "TESTED", "DONE"]);

function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s\-_/.]+/g, " ")
    .trim();
}

type Tab = "endpoints" | "racks" | "measurement";
type PortRow = {
  id: string;
  panelId: string;
  portNumber: number;
  label: string | null;
  cable: {
    id: string;
    code: string;
    status: string;
    notes: string | null;
    peerEndpointCode: string | null;
  } | null;
};


function CompletionPlanEditor() {
  const { projectId, planId } = Route.useParams();
  const qc = useQueryClient();

  const dataFn = useServerFn(getCompletionPlan);
  const setEpFn = useServerFn(setEndpointCompletionStatus);
  const setPpFn = useServerFn(setPatchPanelCompletionStatus);
  const setMeasuredFn = useServerFn(setCableMeasured);
  const setCancelledFn = useServerFn(setCableCancelled);
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
  const [measureTarget, setMeasureTarget] = useState<PortRow | null>(null);
  const [measureNote, setMeasureNote] = useState("");
  const [measureBusy, setMeasureBusy] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightPortId, setHighlightPortId] = useState<string | null>(null);
  const portRefs = useRef(new Map<string, HTMLButtonElement>());
  const registerPortRef = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) portRefs.current.set(id, el);
    else portRefs.current.delete(id);
  }, []);

  const endpoints = q.data?.endpoints ?? [];
  const panels = q.data?.panels ?? [];
  const cables = q.data?.cables ?? [];
  const ports: PortRow[] = q.data?.ports ?? [];
  const plan = q.data?.plan;
  const fp = q.data?.floorPlan;

  const portsByPanel = useMemo(() => {
    const m = new Map<string, PortRow[]>();
    for (const p of ports) {
      const arr = m.get(p.panelId) ?? [];
      arr.push(p);
      m.set(p.panelId, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.portNumber - b.portNumber);
    return m;
  }, [ports]);

  const panelById = useMemo(() => {
    const m = new Map<string, (typeof panels)[number]>();
    for (const p of panels) m.set(p.id, p);
    return m;
  }, [panels]);

  const searchIndex = useMemo(() => {
    return ports
      .filter((p) => p.cable)
      .map((p) => {
        const panel = panelById.get(p.panelId);
        const panelCode = panel?.code ?? "";
        const haystack = normalizeSearch(
          [
            p.cable?.code ?? "",
            p.cable?.peerEndpointCode ?? "",
            p.cable?.notes ?? "",
            `${panelCode}/${p.portNumber}`,
            `${panelCode} ${p.portNumber}`,
            `${panelCode}${p.portNumber}`,
          ].join(" "),
        );
        return { port: p, panelCode, haystack };
      });
  }, [ports, panelById]);

  const searchResults = useMemo(() => {
    const q = normalizeSearch(searchQ).trim();
    if (q.length === 0) return [] as typeof searchIndex;
    const tokens = q.split(/\s+/).filter(Boolean);
    const scored: Array<{ item: (typeof searchIndex)[number]; score: number }> = [];
    for (const item of searchIndex) {
      let ok = true;
      let score = 0;
      for (const t of tokens) {
        const idx = item.haystack.indexOf(t);
        if (idx < 0) {
          ok = false;
          break;
        }
        score += idx === 0 ? 3 : 1;
      }
      if (ok) scored.push({ item, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 40).map((s) => s.item);
  }, [searchIndex, searchQ]);

  function pickSearchResult(port: PortRow) {
    setSearchOpen(false);
    setSearchQ("");
    setHighlightPortId(port.id);
    // ensure measurement tab visible
    setTab("measurement");
    requestAnimationFrame(() => {
      const el = portRefs.current.get(port.id);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    if (port.cable && canManage) {
      setMeasureTarget(port);
      setMeasureNote(port.cable.notes ?? "");
    }
    // clear highlight after a while
    window.setTimeout(() => {
      setHighlightPortId((cur) => (cur === port.id ? null : cur));
    }, 4000);
  }


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
  async function cancelCable(cableId: string, code: string) {
    if (!confirm(`Opravdu zrušit kabel ${code}?`)) return;
    try {
      await setCancelledFn({ data: { cableId } });
      toast.success(`Kabel ${code} zrušen`);
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

  async function confirmMeasure() {
    if (!measureTarget?.cable) return;
    setMeasureBusy(true);
    try {
      await setMeasuredFn({
        data: {
          cableId: measureTarget.cable.id,
          note: measureNote.trim().length > 0 ? measureNote.trim() : null,
        },
      });
      toast.success(`Port ${measureTarget.portNumber} proměřen`);
      setMeasureTarget(null);
      setMeasureNote("");
      await qc.invalidateQueries({ queryKey: ["completion-plan", planId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Chyba");
    } finally {
      setMeasureBusy(false);
    }
  }

  const measuredCount = ports.filter((p) => p.cable && MEASURED_STATUSES.has(p.cable.status)).length;
  const totalWithCable = ports.filter((p) => p.cable).length;


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
          <TabBtn active={tab === "measurement"} onClick={() => setTab("measurement")}>
            <Ruler className="mr-2 h-4 w-4" /> Měření
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
                    onCancelCable={cancelCable}
                    canEdit={canManage}
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

        {tab === "measurement" && (
          <section className="space-y-3">
            {/* Sticky search bar */}
            <div className="sticky top-0 z-30 -mx-2 border-b border-border/60 bg-background/95 px-2 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/70">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="flex w-full items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-primary/50 active:scale-[0.99]"
              >
                <Search className="h-4 w-4 shrink-0" />
                <span className="truncate">Hledat kabel, endpoint, PP/port…</span>
                <span className="ml-auto shrink-0 rounded-sm border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                  {searchIndex.length}
                </span>
              </button>
            </div>

            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Měření kabelů podle portů
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {measuredCount}/{totalWithCable} proměřeno
              </div>
            </div>
            {!canManage && (
              <div className="rounded-sm border border-dashed p-3 text-center text-xs text-muted-foreground">
                Měření mohou zaznamenávat jen technici a projektoví manažeři. Můžeš pouze prohlížet.
              </div>
            )}
            {panels.length === 0 && (
              <div className="rounded-sm border border-dashed p-6 text-center text-xs text-muted-foreground">
                Na patře plánu nejsou žádné patch panely.
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              {panels.map((p) => {
                const rows = portsByPanel.get(p.id) ?? [];
                return (
                  <MeasurementPanelCard
                    key={p.id}
                    panel={p}
                    ports={rows}
                    canEdit={canManage}
                    highlightPortId={highlightPortId}
                    registerPortRef={registerPortRef}
                    onMeasure={(port) => {
                      setMeasureTarget(port);
                      setMeasureNote(port.cable?.notes ?? "");
                    }}
                  />
                );
              })}
            </div>
          </section>
        )}
      </div>

      <Dialog
        open={measureTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setMeasureTarget(null);
            setMeasureNote("");
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Proměřeno?</DialogTitle>
            <DialogDescription>
              {measureTarget?.cable ? (
                <>
                  Označit kabel <span className="font-mono font-bold">{measureTarget.cable.code}</span>{" "}
                  na portu <span className="font-mono font-bold">{measureTarget.portNumber}</span> jako
                  proměřený?
                </>
              ) : (
                "Port bez kabelu nelze proměřit."
              )}
            </DialogDescription>
          </DialogHeader>
          {measureTarget && (() => {
            const panel = panelById.get(measureTarget.panelId);
            const panelPorts = portsByPanel.get(measureTarget.panelId) ?? [];
            if (!panel) return null;
            return (
              <div className="rounded-md border border-border/60 bg-neutral-950/40 p-2">
                <div className="mb-1.5 flex items-center justify-between px-1">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Rack · {panel.code}
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    port {measureTarget.portNumber}/{panel.portCount}
                  </div>
                </div>
                <MiniPanelViz
                  portCount={panel.portCount}
                  ports={panelPorts}
                  highlightPortId={measureTarget.id}
                />
              </div>
            );
          })()}
          <div className="space-y-2">
            <label className="font-mono text-[10px] uppercase text-muted-foreground">
              Poznámka (volitelná)
            </label>
            <Textarea
              value={measureNote}
              onChange={(e) => setMeasureNote(e.target.value)}
              placeholder="Např. naměřené hodnoty, poznámky k měření…"
              rows={3}
            />
          </div>
          <DialogFooter className="flex-wrap gap-2 sm:justify-between">
            <Button
              variant="destructive"
              onClick={async () => {
                if (!measureTarget?.cable) return;
                if (!confirm(`Opravdu zrušit kabel ${measureTarget.cable.code}?`)) return;
                setMeasureBusy(true);
                try {
                  await setCancelledFn({ data: { cableId: measureTarget.cable.id } });
                  toast.success(`Kabel ${measureTarget.cable.code} zrušen`);
                  setMeasureTarget(null);
                  setMeasureNote("");
                  await qc.invalidateQueries({ queryKey: ["completion-plan", planId] });
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Chyba");
                } finally {
                  setMeasureBusy(false);
                }
              }}
              disabled={measureBusy || !measureTarget?.cable || !canManage}
            >
              Zrušit kabel
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setMeasureTarget(null);
                  setMeasureNote("");
                }}
                disabled={measureBusy}
              >
                Zavřít
              </Button>
              <Button
                onClick={confirmMeasure}
                disabled={measureBusy || !measureTarget?.cable || !canManage}
              >
                {measureBusy ? "Ukládám…" : "Potvrdit proměřeno"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Search sheet — mobile-first bottom sheet */}
      <Sheet open={searchOpen} onOpenChange={setSearchOpen}>
        <SheetContent
          side="bottom"
          className="flex h-[85vh] flex-col gap-0 p-0 sm:h-[80vh]"
        >
          <SheetHeader className="border-b border-border px-4 py-3">
            <SheetTitle className="font-mono text-sm uppercase">Hledat kabel</SheetTitle>
          </SheetHeader>
          <div className="border-b border-border px-3 py-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Kód kabelu, endpoint, PP/port…"
                enterKeyHint="search"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="h-11 pl-9 pr-9 font-mono text-base"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && searchResults[0]) {
                    e.preventDefault();
                    pickSearchResult(searchResults[0].port);
                  }
                }}
              />
              {searchQ.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSearchQ("")}
                  className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground"
                  aria-label="Vymazat"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] uppercase text-muted-foreground">
              <span>{searchQ.trim().length === 0 ? "Zadej alespoň 1 znak" : `${searchResults.length} výsledků`}</span>
              <span>{searchIndex.length} kabelů celkem</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {searchQ.trim().length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Napiš část kódu kabelu, endpointu (např. „CSO08"), nebo „PP2/17".
              </div>
            ) : searchResults.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                Nic nenalezeno.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {searchResults.map(({ port, panelCode }) => {
                  const cable = port.cable!;
                  const isMeasured = MEASURED_STATUSES.has(cable.status);
                  return (
                    <li key={port.id}>
                      <button
                        type="button"
                        onClick={() => pickSearchResult(port)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 active:bg-muted"
                      >
                        <span
                          className={cn(
                            "h-2 w-2 shrink-0 rounded-full",
                            isMeasured
                              ? "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.9)]"
                              : "bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.9)]",
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-mono text-sm font-bold">
                            {cable.code}
                          </div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {cable.peerEndpointCode ?? "—"}
                          </div>
                        </div>
                        <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
                          {panelCode}/{port.portNumber}
                        </Badge>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </SheetContent>
      </Sheet>
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
  const contentRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<{ startX: number; startY: number; tx0: number; ty0: number } | null>(null);
  const viewRef = useRef({ tx: 0, ty: 0, s: 1 });
  const [view, setView] = useState({ tx: 0, ty: 0, s: 1 });
  const rafRef = useRef<number | null>(null);
  const commitRafRef = useRef<number | null>(null);
  const selectedEndpoint = endpoints.find((ep) => ep.id === selectedEndpointId) ?? null;
  const selectedCables = selectedEndpoint
    ? cables.filter((c) => c.fromEndpointId === selectedEndpoint.id || c.toEndpointId === selectedEndpoint.id)
    : [];

  const applyTransformNow = () => {
    const el = contentRef.current;
    if (!el) return;
    const v = viewRef.current;
    el.style.transform = `translate3d(${v.tx}px, ${v.ty}px, 0) scale(${v.s})`;
  };
  const scheduleApply = () => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      applyTransformNow();
    });
  };
  const commitStateSoon = () => {
    if (commitRafRef.current != null) cancelAnimationFrame(commitRafRef.current);
    commitRafRef.current = requestAnimationFrame(() => {
      commitRafRef.current = null;
      setView({ ...viewRef.current });
    });
  };
  useEffect(() => {
    viewRef.current = view;
    applyTransformNow();
  }, [view]);
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (commitRafRef.current != null) cancelAnimationFrame(commitRafRef.current);
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const factor = Math.exp(-(e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY) * 0.0018);
      const v = viewRef.current;
      const ns = Math.min(12, Math.max(0.5, v.s * factor));
      if (ns === v.s) return;
      const k = ns / v.s;
      viewRef.current = { tx: mx - k * (mx - v.tx), ty: my - k * (my - v.ty), s: ns };
      scheduleApply();
      commitStateSoon();
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // Touch pinch + pan
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let mode: "none" | "pan" | "pinch" = "none";
    let sx = 0;
    let sy = 0;
    let ox = 0;
    let oy = 0;
    let pinchDist = 0;
    let pinchZoom = 1;
    let pinchCenter = { x: 0, y: 0 };
    const dist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const isInteractive = (target: EventTarget | null) => {
      const el = target as Element | null;
      return !!el?.closest?.("button, a, input, textarea, select, [role='button'], [data-no-pan]");
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        if (isInteractive(e.target)) return;
        const t = e.target as Element | null;
        if (t && t instanceof SVGElement && t.tagName !== "svg") return;
        mode = "pan";
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
        ox = viewRef.current.tx;
        oy = viewRef.current.ty;
      } else if (e.touches.length === 2) {
        mode = "pinch";
        pinchDist = dist(e.touches[0], e.touches[1]);
        pinchZoom = viewRef.current.s;
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
        viewRef.current = {
          ...viewRef.current,
          tx: ox + (e.touches[0].clientX - sx),
          ty: oy + (e.touches[0].clientY - sy),
        };
        scheduleApply();
        e.preventDefault();
      } else if (mode === "pinch" && e.touches.length === 2 && pinchDist > 0) {
        const d = dist(e.touches[0], e.touches[1]);
        const ns = Math.min(12, Math.max(0.5, pinchZoom * (d / pinchDist)));
        const v = viewRef.current;
        if (ns !== v.s) {
          const k = ns / v.s;
          viewRef.current = {
            tx: pinchCenter.x - k * (pinchCenter.x - v.tx),
            ty: pinchCenter.y - k * (pinchCenter.y - v.ty),
            s: ns,
          };
          scheduleApply();
        }
        e.preventDefault();
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        if (mode !== "none") setView({ ...viewRef.current });
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

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    if (event.button !== 0 && event.button !== 1) return;
    const target = event.target as SVGElement | HTMLElement;
    if ((target as Element).closest?.("button, a, input, textarea, select, [role='button'], [data-no-pan]")) return;
    if (target instanceof SVGElement && target.tagName !== "svg") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    panRef.current = { startX: event.clientX, startY: event.clientY, tx0: viewRef.current.tx, ty0: viewRef.current.ty };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!panRef.current) return;
    if (event.pointerType !== "mouse") return;
    viewRef.current = {
      ...viewRef.current,
      tx: panRef.current.tx0 + event.clientX - panRef.current.startX,
      ty: panRef.current.ty0 + event.clientY - panRef.current.startY,
    };
    scheduleApply();
  };
  const onPointerUp = () => {
    if (panRef.current) {
      setView({ ...viewRef.current });
    }
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
        contentRef={contentRef}
        contentClassName="origin-top-left"
        contentStyle={{ transform: `translate3d(${view.tx}px, ${view.ty}px, 0) scale(${view.s})` }}
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
                  {ENDPOINT_STATUSES.map((status) => {
                    const isPulled = status === "PULLED";
                    return (
                      <Button
                        key={status}
                        size="sm"
                        variant={status === selectedEndpoint.completionStatus ? "default" : "outline"}
                        className="h-7 px-2 font-mono text-[10px]"
                        disabled={isPulled}
                        title={isPulled ? "Řídí režim Tahání" : undefined}
                        onClick={() => !isPulled && onSetStatus(selectedEndpoint.id, status)}
                      >
                        {EP_LABEL[status]}
                        {isPulled && " 🔒"}
                      </Button>
                    );
                  })}
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
  onCancelCable,
  canEdit,
}: {
  endpoint: { id: string; code: string; kind: string | null; completionStatus: EndpointCompletionStatus };
  cables: Array<{ id: string; code: string; status: string }>;
  selected: boolean;
  onSelect: () => void;
  onSetStatus: (s: EndpointCompletionStatus) => void;
  onCancelCable: (cableId: string, code: string) => void;
  canEdit: boolean;
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
            {ENDPOINT_STATUSES.map((s) => {
              const isPulled = s === "PULLED";
              return (
                <Button
                  key={s}
                  size="sm"
                  variant={s === endpoint.completionStatus ? "default" : "outline"}
                  className="h-7 px-2 font-mono text-[10px]"
                  disabled={isPulled}
                  title={isPulled ? "Řídí režim Tahání" : undefined}
                  onClick={() => !isPulled && onSetStatus(s)}
                >
                  {EP_LABEL[s]}
                  {isPulled && " 🔒"}
                </Button>
              );
            })}
          </div>
          {cables.length > 0 && (
            <div className="rounded-sm border border-border/60 bg-muted/30 p-2">
              <div className="mb-1 font-mono text-[10px] uppercase text-muted-foreground">Kabely</div>
              <div className="space-y-0.5">
                {cables.map((c) => {
                  const isCancelled = c.status === "CANCELLED";
                  return (
                    <div key={c.id} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className={cn("font-mono", isCancelled && "line-through opacity-60")}>{c.code}</span>
                      <span className="flex items-center gap-1">
                        <span className="font-mono text-muted-foreground">{c.status}</span>
                        {canEdit && !isCancelled && (
                          <button
                            type="button"
                            aria-label={`Zrušit kabel ${c.code}`}
                            title="Zrušit kabel"
                            onClick={(e) => {
                              e.stopPropagation();
                              onCancelCable(c.id, c.code);
                            }}
                            className="rounded-sm border border-destructive/40 px-1 text-[10px] text-destructive hover:bg-destructive hover:text-destructive-foreground"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    </div>
                  );
                })}
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

function MeasurementPanelCard({
  panel,
  ports,
  canEdit,
  onMeasure,
  highlightPortId,
  registerPortRef,
}: {
  panel: { id: string; code: string; name: string | null; portCount: number };
  ports: PortRow[];
  canEdit: boolean;
  onMeasure: (port: PortRow) => void;
  highlightPortId?: string | null;
  registerPortRef?: (id: string, el: HTMLButtonElement | null) => void;
}) {
  const measured = ports.filter((p) => p.cable && MEASURED_STATUSES.has(p.cable.status)).length;
  const withCable = ports.filter((p) => p.cable).length;
  const hasHighlight = highlightPortId ? ports.some((p) => p.id === highlightPortId) : false;
  const [open, setOpen] = useState(true);
  // auto-open when a search result targets a port in this panel
  useEffect(() => {
    if (hasHighlight) setOpen(true);
  }, [hasHighlight]);

  // Normalize to portCount slots (fill missing with null so illustration matches real panel)
  const slots: Array<PortRow | null> = useMemo(() => {
    const byNum = new Map<number, PortRow>();
    for (const p of ports) byNum.set(p.portNumber, p);
    const total = Math.max(panel.portCount || 0, ports.length);
    const arr: Array<PortRow | null> = [];
    for (let i = 1; i <= total; i++) arr.push(byNum.get(i) ?? null);
    return arr;
  }, [ports, panel.portCount]);

  // Split into two rows like a real 1U patch panel; halve on typical counts (24, 48…)
  const half = Math.ceil(slots.length / 2);
  const rowA = slots.slice(0, half);
  const rowB = slots.slice(half);

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 border-b border-border/60 px-3 py-2 text-left transition-colors hover:bg-muted/40"
        aria-expanded={open}
      >
        <div className="flex min-w-0 items-center gap-2">
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              !open && "-rotate-90",
            )}
          />
          <div className="min-w-0">
            <div className="truncate font-mono text-sm font-bold uppercase">{panel.code}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {panel.name ?? "—"} · {panel.portCount} portů
            </div>
          </div>
        </div>
        <Badge variant="outline" className="shrink-0 font-mono text-[10px]">
          {measured}/{withCable} proměřeno
        </Badge>
      </button>

      {open && (
        <div className="space-y-3 bg-gradient-to-b from-neutral-950 to-neutral-900 p-3">
          {/* Illustrated patch panel: 2 rows of RJ45-style jacks */}
          <div className="space-y-2 rounded-sm border border-neutral-800 bg-neutral-950/70 p-2 shadow-inner">
            {[rowA, rowB].map((row, idx) =>
              row.length === 0 ? null : (
                <div
                  key={idx}
                  className="grid gap-1"
                  style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
                >
                  {row.map((port, i) => {
                    if (!port) {
                      return (
                        <div
                          key={`empty-${idx}-${i}`}
                          className="flex flex-col items-stretch gap-0.5"
                        >
                          <div className="aspect-[3/4] rounded-[3px] border border-dashed border-neutral-800 bg-neutral-900/60" />
                          <span className="h-[11px]" />
                        </div>
                      );
                    }
                    const cable = port.cable;
                    const hasCable = !!cable;
                    const isMeasured = hasCable && MEASURED_STATUSES.has(cable!.status);
                    const title = hasCable
                      ? `Port ${port.portNumber} · ${cable!.code}${
                          cable!.peerEndpointCode ? ` → ${cable!.peerEndpointCode}` : ""
                        }${isMeasured ? " · proměřeno" : " · čeká"}`
                      : `Port ${port.portNumber} · bez kabelu`;
                    const isHighlighted = highlightPortId === port.id;
                    // Label under the port shows the CABLE code (not the endpoint).
                    const rawLabel = hasCable ? cable!.code : "";
                    return (
                      <div key={port.id} className="flex flex-col items-stretch gap-0.5">
                        <button
                          ref={(el) => registerPortRef?.(port.id, el)}
                          type="button"
                          title={title}
                          disabled={!hasCable || !canEdit}
                          onClick={() => onMeasure(port)}
                          className={cn(
                            "group relative aspect-[3/4] rounded-[3px] border text-[9px] font-mono transition-all",
                            "flex flex-col items-center justify-between p-[3px]",
                            hasCable
                              ? isMeasured
                                ? "border-emerald-500/70 bg-emerald-500/15 text-emerald-200 shadow-[0_0_6px_-1px_rgba(16,185,129,0.6)]"
                                : "border-amber-500/60 bg-amber-500/10 text-amber-200 hover:border-amber-400 hover:bg-amber-500/20"
                              : "border-neutral-800 bg-neutral-900/80 text-neutral-600",
                            hasCable && canEdit && "cursor-pointer active:scale-95",
                            (!hasCable || !canEdit) && "cursor-default",
                            isHighlighted &&
                              "!border-sky-400 ring-2 ring-sky-400/70 ring-offset-1 ring-offset-neutral-950 animate-pulse",
                          )}
                        >
                          {/* LED */}
                          <span
                            className={cn(
                              "h-1 w-1 rounded-full",
                              isMeasured
                                ? "bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.9)]"
                                : hasCable
                                  ? "bg-amber-400 shadow-[0_0_4px_rgba(245,158,11,0.8)]"
                                  : "bg-neutral-700",
                            )}
                          />
                          {/* RJ45 slit */}
                          <span className="my-[2px] block h-[2px] w-[70%] rounded-[1px] bg-neutral-950/80 shadow-inner" />
                          <span className="leading-none">{port.portNumber}</span>
                        </button>
                        <span
                          title={hasCable ? cable!.code : undefined}
                          className={cn(
                            "block truncate text-center font-mono text-[9px] leading-[11px]",
                            hasCable
                              ? isMeasured
                                ? "text-emerald-300/90"
                                : "text-amber-200/90"
                              : "text-neutral-700",
                          )}
                        >
                          {rawLabel || "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ),
            )}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
            <LegendDot className="bg-emerald-400 shadow-[0_0_4px_rgba(16,185,129,0.9)]" label="Proměřeno" />
            <LegendDot className="bg-amber-400 shadow-[0_0_4px_rgba(245,158,11,0.8)]" label="Čeká na proměření" />
            <LegendDot className="bg-neutral-700" label="Bez kabelu" />
          </div>
        </div>
      )}
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", className)} />
      {label}
    </span>
  );
}

function MiniPanelViz({
  portCount,
  ports,
  highlightPortId,
}: {
  portCount: number;
  ports: PortRow[];
  highlightPortId: string;
}) {
  const byNum = new Map<number, PortRow>();
  for (const p of ports) byNum.set(p.portNumber, p);
  const total = Math.max(portCount || 0, ports.length);
  const slots: Array<PortRow | null> = [];
  for (let i = 1; i <= total; i++) slots.push(byNum.get(i) ?? null);
  const half = Math.ceil(slots.length / 2);
  const rows = [slots.slice(0, half), slots.slice(half)];

  return (
    <div className="space-y-1 rounded-sm border border-neutral-800 bg-neutral-950/70 p-1.5 shadow-inner">
      {rows.map((row, idx) =>
        row.length === 0 ? null : (
          <div
            key={idx}
            className="grid gap-0.5"
            style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
          >
            {row.map((port, i) => {
              if (!port) {
                return (
                  <div
                    key={`e-${idx}-${i}`}
                    className="aspect-[3/4] rounded-[2px] border border-dashed border-neutral-800 bg-neutral-900/60"
                  />
                );
              }
              const cable = port.cable;
              const hasCable = !!cable;
              const isMeasured = hasCable && MEASURED_STATUSES.has(cable!.status);
              const isHighlighted = port.id === highlightPortId;
              return (
                <div
                  key={port.id}
                  title={`Port ${port.portNumber}${cable ? ` · ${cable.code}` : ""}`}
                  className={cn(
                    "relative aspect-[3/4] rounded-[2px] border text-[8px] font-mono flex items-center justify-center",
                    hasCable
                      ? isMeasured
                        ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-200"
                        : "border-amber-500/50 bg-amber-500/10 text-amber-200"
                      : "border-neutral-800 bg-neutral-900/80 text-neutral-600",
                    isHighlighted &&
                      "!border-sky-400 ring-2 ring-sky-400/70 ring-offset-1 ring-offset-neutral-950 animate-pulse z-10",
                  )}
                >
                  {port.portNumber}
                </div>
              );
            })}
          </div>
        ),
      )}
    </div>
  );
}
