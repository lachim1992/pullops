import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Layers,
  MapPinned,
  PackageOpen,
  RefreshCw,
  Server,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlanCanvasSurface } from "@/components/plan-canvas-surface";
import { getPullModeData, setCablePullStatus, setCableQueuedForPull } from "@/lib/pullTasks.functions";
import { endpointKindInfo } from "@/lib/endpointKinds";
import type { NormPoint } from "@/lib/length";

export const Route = createFileRoute("/_authenticated/projects/$projectId/work")({
  head: () => ({
    meta: [{ title: "Režim tahání · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: WorkModePage,
});

type PullCable = {
  id: string;
  code: string;
  status: string;
  typeCode: string;
  meters: number | null;
  floorPlanId: string | null;
  fromEndpointId: string | null;
  fromEndpointCode: string | null;
  toEndpointId: string | null;
  toEndpointCode: string | null;
  branchPoints: NormPoint[];
  bundleId: string | null;
  notes: string | null;
  queuedForPull: boolean;
};


type Endpoint = {
  id: string;
  code: string;
  floorPlanId: string | null;
  kind: string | null;
  x: number;
  y: number;
};

type PatchPanel = {
  id: string;
  code: string;
  name: string | null;
  floorPlanId: string | null;
  portCount: number;
};

type Plan = {
  id: string;
  name: string;
  level: number;
  displayOrder: number;
  documentUrl: string | null;
  mimeType: string | null;
};

type Bundle = { id: string; code: string; floorPlanId: string; points: NormPoint[] };

type SpoolRow = {
  typeCode: string;
  index: number;
  used: number;
  capacity: number;
  wasted: number;
  serialNo?: string | null;
  cables: Array<{ id: string; code: string; meters: number }>;
};


type DayBlock = {
  id: string;
  name: string;
  sortOrder: number;
  plannedDate: string | null;
  floorPlanId: string | null;
  spoolCount: number;
  spoolLengthM: number;
  totalUsed: number;
  totalCapacity: number;
  spools: SpoolRow[];
};

type Tab = "map" | "spools" | "queue";

function WorkModePage() {
  const { projectId } = useParams({ from: "/_authenticated/projects/$projectId/work" });
  const qc = useQueryClient();
  const pullDataFn = useServerFn(getPullModeData);
  const setStatusFn = useServerFn(setCablePullStatus);
  const setQueuedFn = useServerFn(setCableQueuedForPull);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("map");
  const [selectedCableId, setSelectedCableId] = useState<string | null>(null);
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(null);
  const [onlyTodo, setOnlyTodo] = useState(false);
  const [note, setNote] = useState("");

  const pull = useQuery({
    queryKey: ["pull-mode", projectId],
    queryFn: () => pullDataFn({ data: { projectId, defaultSpoolLengthM: 305 } }),
  });

  async function toggleCable(cable: PullCable, done: boolean) {
    try {
      await setStatusFn({
        data: { cableId: cable.id, done, note: cable.id === selectedCableId ? note : "" },
      });
      setNote("");
      await qc.invalidateQueries({ queryKey: ["pull-mode", projectId] });
      toast.success(done ? `Hotovo: ${cable.code}` : `Vráceno: ${cable.code}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  async function toggleQueue(cable: PullCable) {
    // If already pulled — this button acts as return-to-queue (unset PULLED).
    if (cable.status === "PULLED") {
      await toggleCable(cable, false);
      return;
    }
    try {
      const next = !cable.queuedForPull;
      await setQueuedFn({ data: { cableId: cable.id, queued: next } });
      await qc.invalidateQueries({ queryKey: ["pull-mode", projectId] });
      toast.success(next ? `Ve frontě: ${cable.code}` : `Odebráno z fronty: ${cable.code}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }


  return (
    <AppShell projectId={projectId}>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {selectedPlanId && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSelectedPlanId(null);
                setSelectedCableId(null);
                setSelectedEndpointId(null);
              }}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Zpět na plány
            </Button>
          )}
          <div>
            <h1 className="font-mono text-2xl font-bold uppercase tracking-tight">Režim tahání</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {selectedPlanId
                ? "Interaktivní mapa: klikni na cestu, endpoint nebo přepni na spulky."
                : "Vyber plán, na kterém dnes taháš."}
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => pull.refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Obnovit
        </Button>
      </header>

      {pull.isLoading && <div className="text-sm text-muted-foreground">Načítám…</div>}
      {pull.data && !selectedPlanId && (
        <PlanIndex
          plans={pull.data.plans}
          endpoints={pull.data.endpoints}
          cables={pull.data.cables}
          onPick={(id) => {
            setSelectedPlanId(id);
            setTab("map");
          }}
        />
      )}

      {pull.data && selectedPlanId && (
        <PlanWorkspace
          plan={pull.data.plans.find((p) => p.id === selectedPlanId) ?? null}
          bundles={pull.data.bundles.filter((b) => b.floorPlanId === selectedPlanId)}
          endpoints={pull.data.endpoints.filter((e) => e.floorPlanId === selectedPlanId)}
          patchPanels={pull.data.patchPanels.filter((p) => p.floorPlanId === selectedPlanId)}
          cables={pull.data.cables.filter((c) => c.floorPlanId === selectedPlanId)}
          planBlock={pull.data.planBlocks?.find((b) => b.floorPlanId === selectedPlanId) ?? null}
          allDayBlocks={pull.data.dayBlocks ?? []}
          tab={tab}
          setTab={setTab}
          selectedCableId={selectedCableId}
          setSelectedCableId={setSelectedCableId}
          selectedEndpointId={selectedEndpointId}
          setSelectedEndpointId={setSelectedEndpointId}
          onlyTodo={onlyTodo}
          setOnlyTodo={setOnlyTodo}
          note={note}
          setNote={setNote}
          onToggleCable={toggleCable}
          onToggleQueue={toggleQueue}
        />
      )}

    </AppShell>
  );
}

/* ----------------------------- Plan index ----------------------------- */

function PlanIndex({
  plans,
  endpoints,
  cables,
  onPick,
}: {
  plans: Plan[];
  endpoints: Endpoint[];
  cables: PullCable[];
  onPick: (id: string) => void;
}) {
  if (plans.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        Žádný plán zatím není publikován do režimu tahání. Správce projektu ho publikuje v editoru plánu
        (záložka „5 · Zadat plán").
      </div>
    );
  }
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {plans.map((p) => {
        const planCables = cables.filter((c) => c.floorPlanId === p.id);
        const done = planCables.filter((c) => c.status === "PULLED").length;
        const eps = endpoints.filter((e) => e.floorPlanId === p.id).length;
        const pct = planCables.length > 0 ? Math.round((done / planCables.length) * 100) : 0;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onPick(p.id)}
            className="group relative overflow-hidden rounded-sm border border-border bg-card text-left transition-colors hover:border-primary"
          >
            <div className="aspect-[16/10] w-full bg-muted">
              {p.documentUrl && p.mimeType !== "application/pdf" ? (
                <img
                  src={p.documentUrl}
                  alt={p.name}
                  className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Layers className="h-10 w-10" />
                </div>
              )}
            </div>
            <div className="border-t border-border p-3">
              <div className="flex items-center justify-between">
                <div className="font-mono text-sm font-bold uppercase">{p.name}</div>
                <Badge variant="outline" className="font-mono text-[10px]">
                  Patro {p.level}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>{planCables.length} kabelů</span>
                <span>·</span>
                <span>{eps} endpointů</span>
                <span>·</span>
                <span className="font-mono">
                  {done}/{planCables.length} hotovo
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-muted">
                <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </button>
        );
      })}
    </section>
  );
}

/* ----------------------------- Plan workspace ----------------------------- */

function PlanWorkspace(props: {
  plan: Plan | null;
  bundles: Bundle[];
  endpoints: Endpoint[];
  patchPanels: PatchPanel[];
  cables: PullCable[];
  planBlock: {
    id: string;
    floorPlanId: string;
    name: string;
    spoolCount: number;
    spoolLengthM: number;
    totalUsed: number;
    totalCapacity: number;
    hasPhysical: boolean;
    spools: SpoolRow[];
  } | null;
  allDayBlocks: DayBlock[];
  tab: Tab;
  setTab: (t: Tab) => void;
  selectedCableId: string | null;
  setSelectedCableId: (v: string | null) => void;
  selectedEndpointId: string | null;
  setSelectedEndpointId: (v: string | null) => void;
  onlyTodo: boolean;
  setOnlyTodo: (v: boolean) => void;
  note: string;
  setNote: (v: string) => void;
  onToggleCable: (c: PullCable, done: boolean) => void;
  onToggleQueue: (c: PullCable) => void;
}) {
  const {
    plan, bundles, endpoints, patchPanels, cables, planBlock, allDayBlocks,
    tab, setTab, selectedCableId, setSelectedCableId,
    selectedEndpointId, setSelectedEndpointId,
    onlyTodo, setOnlyTodo, note, setNote, onToggleCable, onToggleQueue,
  } = props;

  const [hoveredCableId, setHoveredCableId] = useState<string | null>(null);


  const filteredCables = useMemo(
    () => (onlyTodo ? cables.filter((c) => c.status !== "PULLED") : cables),
    [cables, onlyTodo],
  );

  const selectedCable = cables.find((c) => c.id === selectedCableId) ?? null;
  const selectedEndpoint = endpoints.find((e) => e.id === selectedEndpointId) ?? null;

  // Cables incident to selected endpoint
  const endpointCables = useMemo(() => {
    if (!selectedEndpoint) return [];
    return cables.filter(
      (c) => c.fromEndpointId === selectedEndpoint.id || c.toEndpointId === selectedEndpoint.id,
    );
  }, [cables, selectedEndpoint]);

  const done = cables.filter((c) => c.status === "PULLED").length;

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Plán" value={plan?.name ?? "—"} />
        <StatCard label="Kabelů" value={String(cables.length)} />
        <StatCard label="Hotovo" value={`${done}/${cables.length}`} />
        <StatCard label="Endpointů" value={String(endpoints.length)} />
        <StatCard label="Patch panelů" value={String(patchPanels.length)} />
      </section>

      <div className="flex gap-2 border-b border-border">
        <TabBtn active={tab === "map"} onClick={() => setTab("map")}>
          <MapPinned className="mr-2 h-4 w-4" />
          Mapa
        </TabBtn>
        <TabBtn active={tab === "queue"} onClick={() => setTab("queue")}>
          <Circle className="mr-2 h-4 w-4" />
          Fronta
        </TabBtn>
        <TabBtn active={tab === "spools"} onClick={() => setTab("spools")}>
          <PackageOpen className="mr-2 h-4 w-4" />
          Spulky
        </TabBtn>
      </div>

      {tab === "map" && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="overflow-hidden rounded-sm border border-border bg-card">
            <PullMap
              plan={plan}
              bundles={bundles}
              endpoints={endpoints}
              cables={filteredCables}
              selectedCableId={selectedCable?.id ?? null}
              selectedEndpointId={selectedEndpoint?.id ?? null}
              hoveredCableId={hoveredCableId}
              onSelectCable={(id) => {
                setSelectedCableId(id);
                setSelectedEndpointId(null);
              }}
              onSelectEndpoint={(id) => {
                setSelectedEndpointId(id);
                setSelectedCableId(null);
              }}
              onToggle={onToggleCable}
            />
          </section>

          <aside className="space-y-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} />
              zobrazit jen nehotové kabely
            </label>

            {selectedCable && (
              <CableDetail
                cable={selectedCable}
                bundleCode={bundles.find((b) => b.id === selectedCable.bundleId)?.code ?? null}
                note={note}
                setNote={setNote}
                onToggle={onToggleCable}
              />
            )}

            {selectedEndpoint && (
              <EndpointDetail
                endpoint={selectedEndpoint}
                cables={endpointCables}
                patchPanels={patchPanels}
                onSelectCable={(id) => {
                  setSelectedCableId(id);
                  setSelectedEndpointId(null);
                }}
                onToggle={onToggleCable}
                onHoverCable={setHoveredCableId}
              />
            )}

            {!selectedCable && !selectedEndpoint && (
              <div className="rounded-sm border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Klikni na kabel nebo endpoint na mapě.
              </div>
            )}
          </aside>
        </div>
      )}

      {tab === "queue" && (
        <QueueTab
          cables={cables}
          onToggle={onToggleCable}
          onToggleQueue={onToggleQueue}
        />
      )}

      {tab === "spools" && (
        <SpoolsTab
          planBlock={planBlock}
          dayBlocks={allDayBlocks.filter(
            (b) => b.floorPlanId == null || b.floorPlanId === plan?.id,
          )}
          cables={cables}
          onToggle={onToggleCable}
        />
      )}

    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px flex items-center border-b-2 px-4 py-2 font-mono text-sm uppercase transition-colors ${
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/* ----------------------------- Cable / endpoint side panels ----------------------------- */

function CableDetail({
  cable, bundleCode, note, setNote, onToggle,
}: {
  cable: PullCable;
  bundleCode: string | null;
  note: string;
  setNote: (v: string) => void;
  onToggle: (c: PullCable, done: boolean) => void;
}) {
  const done = cable.status === "PULLED";
  return (
    <section className="rounded-sm border-2 border-accent bg-card p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="font-mono text-base font-bold">{cable.code}</div>
          <div className="text-xs text-muted-foreground">
            {cable.fromEndpointCode ?? "?"} → {cable.toEndpointCode ?? "?"}
          </div>
        </div>
        <Badge variant={done ? "secondary" : "outline"} className="font-mono">
          {done ? "HOTOVO" : "TAHAT"}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Attr label="Typ" value={cable.typeCode} />
        <Attr label="Délka" value={cable.meters == null ? "—" : `${cable.meters.toFixed(1)} m`} />
        <Attr label="Kmen" value={bundleCode ?? "—"} />
        <Attr label="Bodů trasy" value={String(cable.branchPoints.length)} />
      </div>
      <Input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Poznámka při odškrtnutí…"
        className="mt-3"
      />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button size="sm" onClick={() => onToggle(cable, true)} disabled={done}>
          Hotovo
        </Button>
        <Button size="sm" variant="outline" onClick={() => onToggle(cable, false)} disabled={!done}>
          Vrátit
        </Button>
      </div>
      {cable.notes && (
        <div className="mt-2 whitespace-pre-wrap rounded-sm bg-muted/50 p-2 text-xs text-muted-foreground">
          {cable.notes}
        </div>
      )}
    </section>
  );
}

function EndpointDetail({
  endpoint, cables, patchPanels, onSelectCable, onToggle, onHoverCable,
}: {
  endpoint: Endpoint;
  cables: PullCable[];
  patchPanels: PatchPanel[];
  onSelectCable: (id: string) => void;
  onToggle: (c: PullCable, done: boolean) => void;
  onHoverCable?: (id: string | null) => void;
}) {

  const info = endpointKindInfo(endpoint.kind);
  const done = cables.filter((c) => c.status === "PULLED").length;
  return (
    <section className="rounded-sm border-2 border-primary bg-card p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="font-mono text-base font-bold">{endpoint.code}</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: info.color }}
            />
            {info.label}
          </div>
        </div>
        <Badge variant="outline" className="font-mono text-[10px]">
          {done}/{cables.length} hotovo
        </Badge>
      </div>

      {patchPanels.length > 0 && (
        <div className="mb-3 rounded-sm border border-border p-2">
          <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase text-muted-foreground">
            <Server className="h-3 w-3" />
            Patch panely na plánu
          </div>
          <div className="flex flex-wrap gap-1">
            {patchPanels.map((p) => (
              <Badge key={p.id} variant="secondary" className="font-mono text-[10px]">
                {p.code}{p.portCount > 0 ? ` · ${p.portCount}p` : ""}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
        Kabely v tomto bodě ({cables.length})
      </div>
      <div className="max-h-[280px] divide-y divide-border overflow-y-auto rounded-sm border border-border">
        {cables.length === 0 && (
          <div className="p-3 text-xs text-muted-foreground">V tomto bodě žádný kabel.</div>
        )}
        {cables.map((c) => {
          const cdone = c.status === "PULLED";
          const other = c.fromEndpointId === endpoint.id ? c.toEndpointCode : c.fromEndpointCode;
          return (
            <div
              key={c.id}
              className="flex items-center gap-2 p-2 hover:bg-muted/40"
              onMouseEnter={() => onHoverCable?.(c.id)}
              onMouseLeave={() => onHoverCable?.(null)}
            >
              <button
                type="button"
                onClick={() => onSelectCable(c.id)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="truncate font-mono text-xs font-semibold">{c.code}</div>
                <div className="truncate text-[10px] text-muted-foreground">
                  → {other ?? "?"} · {c.typeCode} ·{" "}
                  {c.meters == null ? "—" : `${c.meters.toFixed(1)} m`}
                </div>
              </button>
              <Button
                size="sm"
                variant={cdone ? "outline" : "default"}
                onClick={() => onToggle(c, !cdone)}
                className="h-7 px-2 text-xs"
              >
                {cdone ? "Vrátit" : "Hotovo"}
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Attr({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm bg-muted/40 p-2">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-xs font-semibold">{value}</div>
    </div>
  );
}

/* ----------------------------- Queue tab ----------------------------- */

function QueueTab({
  cables,
  onToggle,
  onToggleQueue,
}: {
  cables: PullCable[];
  onToggle: (c: PullCable, done: boolean) => void;
  onToggleQueue: (c: PullCable) => void;
}) {
  const queued = cables.filter((c) => c.queuedForPull && c.status !== "PULLED");
  const pulled = cables.filter((c) => c.status === "PULLED");
  const queuedMeters = queued.reduce((a, c) => a + (c.meters ?? 0), 0);
  const pulledMeters = pulled.reduce((a, c) => a + (c.meters ?? 0), 0);

  return (
    <div className="space-y-4">
      <section className="rounded-sm border-2 border-accent bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
          <div className="flex items-center gap-2">
            <Circle className="h-4 w-4 text-accent" />
            <h2 className="font-mono text-sm font-bold uppercase">Označené k tahání</h2>
            <Badge variant="outline" className="font-mono text-[10px]">
              {queued.length} kabelů · {queuedMeters.toFixed(1)} m
            </Badge>
          </div>
          <Button
            size="sm"
            disabled={queued.length === 0}
            onClick={() =>
              toast.info(
                `Fronta ${queued.length} kabelů je připravena. Přejdi do Manažera tahání.`,
              )
            }
          >
            Odeslat k tahání
          </Button>
        </div>
        <div className="max-h-[400px] divide-y divide-border overflow-y-auto">
          {queued.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Na mapě klikni na endpoint a u kabelu vyber „TAHAT" — objeví se zde.
            </div>
          )}
          {queued.map((c) => (
            <div key={c.id} className="flex items-center gap-2 p-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-sm font-semibold">{c.code}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {c.fromEndpointCode ?? "?"} → {c.toEndpointCode ?? "?"} · {c.typeCode} ·{" "}
                  {c.meters == null ? "—" : `${c.meters.toFixed(1)} m`}
                </span>
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onToggleQueue(c)}
                className="h-8 px-2 font-mono text-[10px]"
              >
                Odebrat
              </Button>
              <Button
                size="sm"
                onClick={() => onToggle(c, true)}
                className="h-8 px-2 font-mono text-[10px]"
              >
                Nataženo
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-sm border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <h2 className="font-mono text-sm font-bold uppercase">Nataženo</h2>
            <Badge variant="outline" className="font-mono text-[10px]">
              {pulled.length} kabelů · {pulledMeters.toFixed(1)} m
            </Badge>
          </div>
        </div>
        <div className="max-h-[400px] divide-y divide-border overflow-y-auto">
          {pulled.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Zatím žádný natažený kabel.
            </div>
          )}
          {pulled.map((c) => (
            <div key={c.id} className="flex items-center gap-2 p-3">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-sm font-semibold">{c.code}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {c.fromEndpointCode ?? "?"} → {c.toEndpointCode ?? "?"} · {c.typeCode} ·{" "}
                  {c.meters == null ? "—" : `${c.meters.toFixed(1)} m`}
                </span>
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onToggle(c, false)}
                className="h-8 px-2 font-mono text-[10px]"
              >
                Vrátit
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}


/* ----------------------------- Spools tab ----------------------------- */

function SpoolsTab({
  spools,
  dayBlocks,
  cables,
  onToggle,
}: {
  spools: SpoolRow[];
  dayBlocks: DayBlock[];
  cables: PullCable[];
  onToggle: (c: PullCable, done: boolean) => void;
}) {
  const cableById = useMemo(() => {
    const m = new Map<string, PullCable>();
    for (const c of cables) m.set(c.id, c);
    return m;
  }, [cables]);

  const byType = new Map<string, SpoolRow[]>();
  for (const s of spools) {
    const arr = byType.get(s.typeCode) ?? [];
    arr.push(s);
    byType.set(s.typeCode, arr);
  }

  if (spools.length === 0 && dayBlocks.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        Spulky nejde nasimulovat, dokud kabely nemají trasu a kalibraci.
      </div>
    );
  }

  const hasBlocks = dayBlocks.length > 0;

  return (
    <div className="space-y-6">
      {hasBlocks &&
        dayBlocks.map((block) => {
          let pulled = 0;
          let planned = 0;
          for (const s of block.spools) {
            planned += s.used;
            for (const c of s.cables) {
              if (cableById.get(c.id)?.status === "PULLED") pulled += c.meters;
            }
          }
          return (
            <section key={block.id} className="rounded-sm border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
                <div className="flex items-center gap-2">
                  <PackageOpen className="h-4 w-4 text-muted-foreground" />
                  <h2 className="font-mono text-sm font-bold uppercase">{block.name}</h2>
                  {block.plannedDate && (
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {block.plannedDate}
                    </Badge>
                  )}
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {block.spoolCount} × {block.spoolLengthM.toFixed(0)} m
                  </Badge>
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  nataženo {pulled.toFixed(1)} / plán {planned.toFixed(1)} m ·{" "}
                  kapacita {block.totalCapacity.toFixed(0)} m ·{" "}
                  zbývá {Math.max(0, planned - pulled).toFixed(1)} m
                </div>
              </div>
              <div className="grid gap-4 p-4 lg:grid-cols-2">
                {block.spools.map((spool) => (
                  <SpoolCard
                    key={`${block.id}-${spool.index}`}
                    spool={spool}
                    cableById={cableById}
                    onToggle={onToggle}
                  />
                ))}
              </div>
            </section>
          );
        })}

      {spools.length > 0 && (
        <>
          {hasBlocks && (
            <div className="border-t border-dashed border-border pt-2 font-mono text-xs uppercase tracking-wide text-muted-foreground">
              Nezařazené kabely (bez denního bloku)
            </div>
          )}
          {Array.from(byType.entries()).map(([typeCode, list]) => {
            let typePulled = 0;
            let typePlanned = 0;
            for (const s of list) {
              typePlanned += s.used;
              for (const c of s.cables) {
                if (cableById.get(c.id)?.status === "PULLED") typePulled += c.meters;
              }
            }
            return (
              <section key={typeCode} className="rounded-sm border border-border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
                  <div className="flex items-center gap-2">
                    <PackageOpen className="h-4 w-4 text-muted-foreground" />
                    <h2 className="font-mono text-sm font-bold uppercase">{typeCode}</h2>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {list.length} {list.length === 1 ? "spulka" : list.length < 5 ? "spulky" : "spulek"}
                    </Badge>
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    nataženo {typePulled.toFixed(1)} / plán {typePlanned.toFixed(1)} m ·{" "}
                    zbývá {Math.max(0, typePlanned - typePulled).toFixed(1)} m
                  </div>
                </div>
                <div className="grid gap-4 p-4 lg:grid-cols-2">
                  {list.map((spool) => (
                    <SpoolCard
                      key={`${typeCode}-${spool.index}`}
                      spool={spool}
                      cableById={cableById}
                      onToggle={onToggle}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}

/** One spool card: 3D drum + header + cable table with pull button. */
function SpoolCard({
  spool,
  cableById,
  onToggle,
}: {
  spool: SpoolRow;
  cableById: Map<string, PullCable>;
  onToggle: (c: PullCable, done: boolean) => void;
}) {
  const pulledMeters = spool.cables.reduce(
    (a, c) => a + (cableById.get(c.id)?.status === "PULLED" ? c.meters : 0),
    0,
  );
  const remaining = Math.max(0, spool.used - pulledMeters);
  const pulledPct = spool.used > 0 ? Math.min(1, pulledMeters / spool.used) : 0;
  const cablesDone = spool.cables.filter((c) => cableById.get(c.id)?.status === "PULLED").length;

  return (
    <div className="rounded-sm border border-border bg-background">
      {/* Header */}
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[10px]">
            {spool.serialNo ? spool.serialNo : `Spulka #${spool.index}`}
          </Badge>
          <span className="font-mono text-[11px] text-muted-foreground">
            {spool.typeCode}
          </span>
        </div>

        <div className="font-mono text-[11px] text-muted-foreground">
          {pulledMeters.toFixed(1)} / {spool.used.toFixed(1)} m ·{" "}
          zbývá <span className="text-foreground">{remaining.toFixed(1)} m</span> ·{" "}
          {Math.round(pulledPct * 100)}%
        </div>
      </div>

      {/* Drum + progress */}
      <div className="flex items-center gap-3 border-b border-border px-3 py-3">
        <SpoolDrum pulledPct={pulledPct} />
        <div className="flex-1 space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-[width] duration-500"
              style={{ width: `${pulledPct * 100}%` }}
            />
          </div>
          <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
            <span>{cablesDone}/{spool.cables.length} kabelů</span>
            <span>kapacita {spool.capacity.toFixed(0)} m · odpad {spool.wasted.toFixed(1)} m</span>
          </div>
        </div>
      </div>

      {/* Cable table */}
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left font-mono text-[10px] uppercase text-muted-foreground">
            <th className="px-3 py-1.5">Kabel</th>
            <th className="px-3 py-1.5 text-right">Metry</th>
            <th className="px-3 py-1.5">Stav</th>
            <th className="px-3 py-1.5 text-right">Akce</th>
          </tr>
        </thead>
        <tbody>
          {spool.cables.map((c) => {
            const full = cableById.get(c.id);
            const done = full?.status === "PULLED";
            return (
              <tr
                key={c.id}
                className={`border-b border-border/60 last:border-b-0 ${done ? "bg-muted/30 text-muted-foreground line-through" : ""}`}
              >
                <td className="px-3 py-1.5 font-mono">{c.code}</td>
                <td className="px-3 py-1.5 text-right font-mono">{c.meters.toFixed(1)}</td>
                <td className="px-3 py-1.5">
                  {done ? (
                    <Badge variant="secondary" className="font-mono text-[9px]">
                      Nataženo
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="font-mono text-[9px]">
                      Plán
                    </Badge>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right">
                  {full ? (
                    <Button
                      size="sm"
                      variant={done ? "outline" : "default"}
                      className="h-6 px-2 font-mono text-[10px]"
                      onClick={() => onToggle(full, !done)}
                    >
                      {done ? "Vrátit" : "Nataženo"}
                    </Button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 3D-perspective side view of a cable drum. Winding radius shrinks as pulledPct grows. */
function SpoolDrum({ pulledPct }: { pulledPct: number }) {
  const w = 200;
  const h = 130;
  const cxL = 42;
  const cxR = w - 26;
  const cy = h / 2;
  const flangeR = 52;
  const hubR = 12;
  const rxDepth = 9;
  const outerR = hubR + (flangeR - hubR) * (1 - Math.min(1, Math.max(0, pulledPct)));

  const stripes = 10;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0 drop-shadow-sm">
      <defs>
        <linearGradient id="spool-cable-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.55" />
          <stop offset="50%" stopColor="var(--primary)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="spool-flange" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--muted)" />
          <stop offset="100%" stopColor="var(--border)" />
        </linearGradient>
      </defs>

      {/* Back flange (right side, partially hidden) */}
      <ellipse cx={cxR} cy={cy} rx={rxDepth} ry={flangeR} fill="url(#spool-flange)" stroke="var(--border)" strokeWidth={1} />

      {/* Cable body between flanges (only when there's winding left) */}
      {outerR > hubR + 0.5 && (
        <>
          <rect
            x={cxL}
            y={cy - outerR}
            width={cxR - cxL}
            height={2 * outerR}
            fill="url(#spool-cable-body)"
          />
          {/* Winding stripes */}
          {Array.from({ length: stripes }).map((_, i) => {
            const y = cy - outerR + (i / (stripes - 1)) * 2 * outerR;
            return (
              <line
                key={i}
                x1={cxL}
                y1={y}
                x2={cxR}
                y2={y}
                stroke="var(--foreground)"
                strokeOpacity={0.12}
                strokeWidth={0.5}
              />
            );
          })}
          {/* Right end cap of winding (perspective) */}
          <ellipse cx={cxR} cy={cy} rx={rxDepth * 0.75} ry={outerR} fill="var(--primary)" fillOpacity={0.35} />
        </>
      )}

      {/* Hub cylinder */}
      <rect x={cxL} y={cy - hubR} width={cxR - cxL} height={2 * hubR} fill="var(--card)" stroke="var(--border)" strokeWidth={0.5} />
      <ellipse cx={cxR} cy={cy} rx={rxDepth * 0.75} ry={hubR} fill="var(--card)" stroke="var(--border)" strokeWidth={0.5} />

      {/* Front flange (left, fully visible) */}
      <ellipse cx={cxL} cy={cy} rx={rxDepth} ry={flangeR} fill="url(#spool-flange)" stroke="var(--border)" strokeWidth={1.2} />
      {/* Front cap of winding */}
      {outerR > hubR + 0.5 && (
        <ellipse
          cx={cxL}
          cy={cy}
          rx={rxDepth * 0.55}
          ry={outerR}
          fill="var(--primary)"
          fillOpacity={0.22}
          stroke="var(--primary)"
          strokeOpacity={0.5}
          strokeWidth={0.8}
        />
      )}
      {/* Front cap of hub */}
      <ellipse cx={cxL} cy={cy} rx={rxDepth * 0.55} ry={hubR} fill="var(--card)" stroke="var(--border)" strokeWidth={0.8} />
      {/* Axle */}
      <circle cx={cxL} cy={cy} r={2.5} fill="var(--foreground)" />

      {/* Loose unwound strand — visible once anything is pulled */}
      {pulledPct > 0.001 && (
        <path
          d={`M ${cxL - rxDepth * 0.55} ${cy}
              C ${cxL - 22} ${cy + 10 + pulledPct * 20},
                ${cxL - 34} ${h - 20},
                ${cxL - 30} ${h - 6}`}
          stroke="var(--primary)"
          strokeWidth={1.8}
          fill="none"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}



/* ----------------------------- Map ----------------------------- */

function PullMap({
  plan, bundles, endpoints, cables, selectedCableId, selectedEndpointId, hoveredCableId, onSelectCable, onSelectEndpoint, onToggle,
}: {
  plan: Plan | null;
  bundles: Bundle[];
  endpoints: Endpoint[];
  cables: PullCable[];
  selectedCableId: string | null;
  selectedEndpointId: string | null;
  hoveredCableId?: string | null;
  onSelectCable: (id: string) => void;
  onSelectEndpoint: (id: string) => void;
  onToggle?: (c: PullCable, done: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ tx: 0, ty: 0, s: 1 });
  const viewRef = useRef({ tx: 0, ty: 0, s: 1 });
  const panRef = useRef<{ startX: number; startY: number; tx0: number; ty0: number } | null>(null);
  useEffect(() => { viewRef.current = view; }, [view]);
  const selectedCable = cables.find((c) => c.id === selectedCableId) ?? null;
  const selectedEndpoint = endpoints.find((e) => e.id === selectedEndpointId) ?? null;
  const selectedEndpointCables = selectedEndpoint
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
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setView((v) => {
        const ns = Math.min(8, Math.max(0.5, v.s * factor));
        const k = ns / v.s;
        return { tx: mx - k * (mx - v.tx), ty: my - k * (my - v.ty), s: ns };
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // Touch pinch + pan (mobile)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let mode: "none" | "pan" | "pinch" = "none";
    let sx = 0, sy = 0, ox = 0, oy = 0;
    let pinchDist = 0, pinchZoom = 1;
    let pinchCenter = { x: 0, y: 0 };
    const dist = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const isInteractive = (target: EventTarget | null) => {
      const t = target as Element | null;
      return !!t?.closest?.("button, a, input, textarea, select, [role='button'], [data-no-pan]");
    };
    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        if (isInteractive(e.target)) return;
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
        const nx = ox + (e.touches[0].clientX - sx);
        const ny = oy + (e.touches[0].clientY - sy);
        viewRef.current = { ...viewRef.current, tx: nx, ty: ny };
        setView((v) => ({ ...v, tx: nx, ty: ny }));
        e.preventDefault();
      } else if (mode === "pinch" && e.touches.length === 2 && pinchDist > 0) {
        const d = dist(e.touches[0], e.touches[1]);
        const ns = Math.min(8, Math.max(0.5, pinchZoom * (d / pinchDist)));
        const v = viewRef.current;
        if (ns !== v.s) {
          const k = ns / v.s;
          const nv = {
            tx: pinchCenter.x - k * (pinchCenter.x - v.tx),
            ty: pinchCenter.y - k * (pinchCenter.y - v.ty),
            s: ns,
          };
          viewRef.current = nv;
          setView(nv);
        }
        e.preventDefault();
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) mode = "none";
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

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    if (e.button !== 0 && e.button !== 1) return;
    const target = e.target as Element;
    if (target.closest?.("button, a, input, textarea, select, [role='button'], [data-no-pan]")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    panRef.current = { startX: e.clientX, startY: e.clientY, tx0: view.tx, ty0: view.ty };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const pan = panRef.current;
    if (!pan) return;
    if (e.pointerType !== "mouse") return;
    const dx = e.clientX - pan.startX;
    const dy = e.clientY - pan.startY;
    setView((v) => ({ ...v, tx: pan.tx0 + dx, ty: pan.ty0 + dy }));
  };

  const onPointerUp = () => { panRef.current = null; };
  const resetView = () => setView({ tx: 0, ty: 0, s: 1 });

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className="field-plan-viewer relative h-[calc(100vh-220px)] min-h-[560px] w-full touch-none select-none overflow-hidden bg-muted"
    >
        <PlanCanvasSurface
          documentUrl={plan?.documentUrl ?? null}
          mimeType={plan?.mimeType ?? null}
          title={plan?.name ?? "Plán"}
          empty="Plán nemá podkladový obrázek."
          fullscreenTargetRef={containerRef}
          className="touch-none"
          contentClassName="origin-top-left touch-none"
          contentStyle={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`, touchAction: "none" }}
          overlay={
            <div className="pointer-events-none absolute left-3 right-14 top-3 z-20 flex flex-wrap items-start gap-2">
              <div className="rounded-sm border border-border bg-background/90 px-2 py-1 font-mono text-[10px] shadow-sm backdrop-blur">
                Zoom {Math.round(view.s * 100)}% · tažením posun
              </div>
              {selectedCable && (
                <div className="pointer-events-auto max-w-[320px] rounded-sm border-2 border-accent bg-card/95 p-2 text-xs shadow-lg backdrop-blur" data-no-pan>
                  <div className="font-mono text-sm font-bold">{selectedCable.code}</div>
                  <div className="text-muted-foreground">
                    {selectedCable.fromEndpointCode ?? "?"} → {selectedCable.toEndpointCode ?? "?"} · {selectedCable.typeCode} · {selectedCable.meters == null ? "—" : `${selectedCable.meters.toFixed(1)} m`}
                  </div>
                  <div className="mt-1 font-mono text-[10px] uppercase text-foreground">
                    {selectedCable.status === "PULLED" ? "Nataženo" : "K natažení"}
                  </div>
                  {onToggle && (
                    <div className="mt-2 grid grid-cols-2 gap-1">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onToggle(selectedCable, true); }}
                        disabled={selectedCable.status === "PULLED"}
                        className="rounded-sm border border-primary bg-primary px-2 py-1 font-mono text-[10px] uppercase text-primary-foreground disabled:opacity-50"
                      >
                        Hotovo
                      </button>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onToggle(selectedCable, false); }}
                        disabled={selectedCable.status !== "PULLED"}
                        className="rounded-sm border border-border px-2 py-1 font-mono text-[10px] uppercase disabled:opacity-50"
                      >
                        Vrátit
                      </button>
                    </div>
                  )}
                </div>
              )}
              {selectedEndpoint && (
                <div className="pointer-events-auto max-w-[340px] rounded-sm border-2 border-primary bg-card/95 p-2 text-xs shadow-lg backdrop-blur" data-no-pan>
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-mono text-sm font-bold">{selectedEndpoint.code}</div>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {selectedEndpointCables.filter((c) => c.status === "PULLED").length}/{selectedEndpointCables.length} hotovo
                    </Badge>
                  </div>
                  <div className="mt-1 max-h-40 space-y-1 overflow-y-auto">
                    {selectedEndpointCables.map((c) => {
                      const cdone = c.status === "PULLED";
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onToggle?.(c, !cdone); }}
                          disabled={!onToggle}
                          className={`flex w-full items-center justify-between gap-2 rounded-sm border px-2 py-1 font-mono text-[10px] transition-colors ${
                            cdone
                              ? "border-primary/40 bg-primary/10 text-foreground"
                              : "border-border hover:border-primary hover:bg-primary/5 text-muted-foreground"
                          }`}
                          title={cdone ? "Klikni pro vrácení na TAHAT" : "Klikni pro označení HOTOVO"}
                        >
                          <span>{c.code}</span>
                          <span className={cdone ? "text-primary" : "text-accent"}>{cdone ? "HOTOVO" : "TAHAT →"}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          }
        >
        <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {bundles.map((b) =>
            b.points.length < 2 ? null : (
              <g key={b.id}>
                <polyline
                  points={b.points.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke="var(--primary)"
                  strokeOpacity={0.85}
                  strokeWidth={0.008 / view.s}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <text x={b.points[0].x} y={b.points[0].y - 0.012} fontSize={0.014 / view.s} fill="var(--primary)">
                  {b.code}
                </text>
              </g>
            ),
          )}

          {cables.map((c) => {
            if (c.branchPoints.length < 2) return null;
            const selected = c.id === selectedCableId;
            const hovered = c.id === hoveredCableId;
            const done = c.status === "PULLED";
            const points = c.branchPoints.map((p) => `${p.x},${p.y}`).join(" ");
            const stroke = selected
              ? "var(--destructive)"
              : hovered
                ? "var(--primary)"
                : done
                  ? "var(--muted-foreground)"
                  : "var(--accent)";
            const width = selected ? 0.006 : hovered ? 0.007 : 0.0035;
            return (
              <g key={c.id} data-no-pan onClick={() => onSelectCable(c.id)} style={{ cursor: "pointer" }} pointerEvents="all">
                <polyline
                  points={points}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={0.022 / view.s}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points={points}
                  fill="none"
                  stroke={stroke}
                  strokeOpacity={selected || hovered ? 1 : done ? 0.35 : 0.8}
                  strokeWidth={width / view.s}
                  strokeLinejoin="round"
                />
              </g>
            );
          })}

          {endpoints.map((ep) => {
            const info = endpointKindInfo(ep.kind);
            const selected = ep.id === selectedEndpointId;
            const eCables = cables.filter((c) => c.fromEndpointId === ep.id || c.toEndpointId === ep.id);
            const total = eCables.length;
            const doneN = eCables.filter((c) => c.status === "PULLED").length;
            const rightFill =
              total === 0
                ? "var(--muted-foreground)"
                : doneN === total
                  ? "hsl(140 60% 42%)"
                  : "hsl(0 72% 50%)";
            const r = selected ? 0.014 : 0.01;
            const stroke = selected ? "var(--destructive)" : "var(--background)";
            const sw = (selected ? 0.004 : 0.002) / view.s;
            const leftPath = `M ${ep.x} ${ep.y - r} A ${r} ${r} 0 0 0 ${ep.x} ${ep.y + r} Z`;
            const rightPath = `M ${ep.x} ${ep.y - r} A ${r} ${r} 0 0 1 ${ep.x} ${ep.y + r} Z`;
            return (
              <g key={ep.id} data-no-pan onClick={() => onSelectEndpoint(ep.id)} style={{ cursor: "pointer" }} pointerEvents="all">
                <circle cx={ep.x} cy={ep.y} r={Math.max(r * 2.2, 0.022 / view.s)} fill="transparent" />
                <path d={leftPath} fill={info.color} stroke={stroke} strokeWidth={sw} />
                <path d={rightPath} fill={rightFill} stroke={stroke} strokeWidth={sw} />

                <text x={ep.x} y={ep.y - r - 0.004} textAnchor="middle" fontSize={0.012 / view.s} fill="var(--foreground)">
                  {ep.code}
                </text>
                {total > 0 && (
                  <text x={ep.x} y={ep.y + r + 0.014} textAnchor="middle" fontSize={0.01 / view.s} fill="var(--foreground)" opacity={0.75}>
                    {doneN}/{total}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        </PlanCanvasSurface>

      <div className="pointer-events-none absolute right-3 top-3 flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setView((v) => ({ ...v, s: Math.min(8, v.s * 1.2) }))}
          className="pointer-events-auto rounded-sm border border-border bg-background/90 px-2 py-1 text-xs font-mono hover:bg-background"
        >+</button>
        <button
          type="button"
          onClick={() => setView((v) => ({ ...v, s: Math.max(0.5, v.s / 1.2) }))}
          className="pointer-events-auto rounded-sm border border-border bg-background/90 px-2 py-1 text-xs font-mono hover:bg-background"
        >−</button>
        <button
          type="button"
          onClick={resetView}
          className="pointer-events-auto rounded-sm border border-border bg-background/90 px-2 py-1 text-[10px] font-mono hover:bg-background"
        >1:1</button>
        <div className="pointer-events-none rounded-sm bg-background/70 px-1 py-0.5 text-center text-[10px] font-mono text-muted-foreground">
          {Math.round(view.s * 100)}%
        </div>
      </div>
    </div>
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
        console.error("PDF podklad se nepodařilo vykreslit", err);
        if (!cancelled) setStatus("error");
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
      {status === "loading" && <div className="absolute font-mono text-xs text-muted-foreground">Načítám PDF…</div>}
      {status === "error" && <div className="absolute text-xs text-destructive">PDF se nepodařilo zobrazit.</div>}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-border bg-card p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-lg font-semibold">{value}</div>
    </div>
  );
}
