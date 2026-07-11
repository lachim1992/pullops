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
import { getPullModeData, setCablePullStatus } from "@/lib/pullTasks.functions";
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

type Tab = "map" | "spools" | "queue";

function WorkModePage() {
  const { projectId } = useParams({ from: "/_authenticated/projects/$projectId/work" });
  const qc = useQueryClient();
  const pullDataFn = useServerFn(getPullModeData);
  const setStatusFn = useServerFn(setCablePullStatus);
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
          allSpools={pull.data.spools}
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
        V tomto projektu zatím nejsou žádné plány. Musí je nahrát správce projektu.
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
  allSpools: Array<{
    typeCode: string;
    index: number;
    used: number;
    capacity: number;
    wasted: number;
    cables: Array<{ id: string; code: string; meters: number }>;
  }>;
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
}) {
  const {
    plan, bundles, endpoints, patchPanels, cables, allSpools,
    tab, setTab, selectedCableId, setSelectedCableId,
    selectedEndpointId, setSelectedEndpointId,
    onlyTodo, setOnlyTodo, note, setNote, onToggleCable,
  } = props;

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
              onSelectCable={(id) => {
                setSelectedCableId(id);
                setSelectedEndpointId(null);
              }}
              onSelectEndpoint={(id) => {
                setSelectedEndpointId(id);
                setSelectedCableId(null);
              }}
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
          cables={filteredCables}
          bundles={bundles}
          onlyTodo={onlyTodo}
          setOnlyTodo={setOnlyTodo}
          note={note}
          setNote={setNote}
          selectedCableId={selectedCableId}
          setSelectedCableId={setSelectedCableId}
          onToggle={onToggleCable}
        />
      )}

      {tab === "spools" && <SpoolsTab spools={allSpools} />}
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
  endpoint, cables, patchPanels, onSelectCable, onToggle,
}: {
  endpoint: Endpoint;
  cables: PullCable[];
  patchPanels: PatchPanel[];
  onSelectCable: (id: string) => void;
  onToggle: (c: PullCable, done: boolean) => void;
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
            <div key={c.id} className="flex items-center gap-2 p-2">
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
  cables, bundles, onlyTodo, setOnlyTodo, note, setNote, selectedCableId, setSelectedCableId, onToggle,
}: {
  cables: PullCable[];
  bundles: Bundle[];
  onlyTodo: boolean;
  setOnlyTodo: (v: boolean) => void;
  note: string;
  setNote: (v: string) => void;
  selectedCableId: string | null;
  setSelectedCableId: (id: string | null) => void;
  onToggle: (c: PullCable, done: boolean) => void;
}) {
  const selected = cables.find((c) => c.id === selectedCableId) ?? null;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-sm border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border p-3">
          <div className="font-mono text-sm font-semibold uppercase">Fronta tahání</div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} />
            jen nehotové
          </label>
        </div>
        <div className="max-h-[560px] divide-y divide-border overflow-y-auto">
          {cables.map((c) => {
            const done = c.status === "PULLED";
            const active = c.id === selectedCableId;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedCableId(c.id)}
                className={`flex w-full items-center gap-2 p-3 text-left transition-colors hover:bg-muted/50 ${
                  active ? "bg-muted" : ""
                }`}
              >
                {done ? (
                  <CheckCircle2 className="h-5 w-5 text-accent" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-sm font-semibold">{c.code}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {c.fromEndpointCode ?? "?"} → {c.toEndpointCode ?? "?"} · {c.typeCode} ·{" "}
                    {c.meters == null ? "—" : `${c.meters.toFixed(1)} m`}
                  </span>
                </span>
                <Badge variant={done ? "secondary" : "outline"} className="font-mono text-[10px]">
                  {done ? "HOTOVO" : "TAHAT"}
                </Badge>
              </button>
            );
          })}
          {cables.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">Ve frontě nic není.</div>
          )}
        </div>
      </section>
      <aside>
        {selected ? (
          <CableDetail
            cable={selected}
            bundleCode={bundles.find((b) => b.id === selected.bundleId)?.code ?? null}
            note={note}
            setNote={setNote}
            onToggle={onToggle}
          />
        ) : (
          <div className="rounded-sm border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Vyber kabel z fronty.
          </div>
        )}
      </aside>
    </div>
  );
}

/* ----------------------------- Spools tab ----------------------------- */

function SpoolsTab({
  spools,
}: {
  spools: Array<{
    typeCode: string;
    index: number;
    used: number;
    capacity: number;
    wasted: number;
    cables: Array<{ id: string; code: string; meters: number }>;
  }>;
}) {
  // Group by type, then chunk in stacks of max 3
  const byType = new Map<string, typeof spools>();
  for (const s of spools) {
    const arr = byType.get(s.typeCode) ?? [];
    arr.push(s);
    byType.set(s.typeCode, arr);
  }

  if (spools.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        Spulky nejde nasimulovat, dokud kabely nemají trasu a kalibraci.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Array.from(byType.entries()).map(([typeCode, list]) => {
        // chunk into stacks of 3
        const stacks: (typeof list)[] = [];
        for (let i = 0; i < list.length; i += 3) stacks.push(list.slice(i, i + 3));
        const totalUsed = list.reduce((s, x) => s + x.used, 0);
        const totalWaste = list.reduce((s, x) => s + x.wasted, 0);
        return (
          <section key={typeCode} className="rounded-sm border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
              <div className="flex items-center gap-2">
                <PackageOpen className="h-4 w-4 text-muted-foreground" />
                <h2 className="font-mono text-sm font-bold uppercase">{typeCode}</h2>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {list.length} spulek
                </Badge>
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {totalUsed.toFixed(1)} m použito · odpad {totalWaste.toFixed(1)} m
              </div>
            </div>
            <div className="grid gap-6 p-4 md:grid-cols-2 xl:grid-cols-3">
              {stacks.map((stack, i) => (
                <SpoolStack key={i} spools={stack} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Vertical stack of up to 3 drum visualizations (side-view). */
function SpoolStack({
  spools,
}: {
  spools: Array<{
    typeCode: string;
    index: number;
    used: number;
    capacity: number;
    wasted: number;
    cables: Array<{ id: string; code: string; meters: number }>;
  }>;
}) {
  return (
    <div className="rounded-sm border border-border bg-background p-4">
      <div className="mb-3 flex justify-center gap-4">
        {spools.map((s) => (
          <SpoolDrum key={s.index} spool={s} />
        ))}
      </div>
      <div className="space-y-2">
        {spools.map((s) => {
          const pct = s.capacity > 0 ? (s.used / s.capacity) * 100 : 0;
          return (
            <div key={s.index} className="rounded-sm border border-border p-2">
              <div className="mb-1 flex items-center justify-between">
                <Badge variant="outline" className="font-mono text-[10px]">
                  Spulka #{s.index}
                </Badge>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {s.used.toFixed(1)}/{s.capacity.toFixed(0)} m · {pct.toFixed(0)}%
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {s.cables.map((c) => (
                  <Badge key={c.id} variant="secondary" className="font-mono text-[9px]">
                    {c.code} · {c.meters.toFixed(1)}
                  </Badge>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** SVG side-view of a cable drum: outer flange + concentric rings from used cable segments. */
function SpoolDrum({
  spool,
}: {
  spool: {
    used: number;
    capacity: number;
    cables: Array<{ id: string; code: string; meters: number }>;
  };
}) {
  const size = 110;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = 48;
  const rHub = 14;
  const usedRatio = spool.capacity > 0 ? Math.min(1, spool.used / spool.capacity) : 0;
  // radial fill from hub outward
  const rFill = rHub + (rOuter - rHub) * usedRatio;

  // color bands per cable (proportional angular slice on the front face)
  const palette = ["#f97316", "#22d3ee", "#a3e635", "#f472b6", "#fbbf24", "#8b5cf6", "#34d399"];
  const total = spool.cables.reduce((s, c) => s + c.meters, 0) || 1;

  // draw concentric arcs from center outward, each cable a ring segment
  let acc = rHub;
  const rings: Array<{ r0: number; r1: number; color: string }> = [];
  spool.cables.forEach((c, i) => {
    const thick = ((c.meters / total) * (rFill - rHub));
    rings.push({ r0: acc, r1: acc + thick, color: palette[i % palette.length] });
    acc += thick;
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="drop-shadow">
      {/* outer flange */}
      <circle cx={cx} cy={cy} r={rOuter} fill="var(--muted)" stroke="var(--border)" strokeWidth={1.5} />
      {/* empty core (unused capacity ring) */}
      <circle cx={cx} cy={cy} r={rFill} fill="var(--background)" />
      {/* cable rings */}
      {rings.map((ring, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={(ring.r0 + ring.r1) / 2}
          fill="none"
          stroke={ring.color}
          strokeWidth={Math.max(1, ring.r1 - ring.r0)}
        />
      ))}
      {/* hub */}
      <circle cx={cx} cy={cy} r={rHub} fill="var(--card)" stroke="var(--border)" strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={2.5} fill="var(--foreground)" />
    </svg>
  );
}

/* ----------------------------- Map ----------------------------- */

function PullMap({
  plan, bundles, endpoints, cables, selectedCableId, selectedEndpointId, onSelectCable, onSelectEndpoint,
}: {
  plan: Plan | null;
  bundles: Bundle[];
  endpoints: Endpoint[];
  cables: PullCable[];
  selectedCableId: string | null;
  selectedEndpointId: string | null;
  onSelectCable: (id: string) => void;
  onSelectEndpoint: (id: string) => void;
}) {
  return (
    <div className="relative h-[calc(100vh-220px)] min-h-[560px] w-full overflow-hidden bg-muted">
      {plan?.documentUrl ? (
        plan.mimeType === "application/pdf" ? (
          <PdfPlanBackground url={plan.documentUrl} title={plan.name} />
        ) : (
          <img
            src={plan.documentUrl}
            alt={plan.name}
            className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
          />
        )
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Plán nemá podkladový obrázek.
        </div>
      )}
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {bundles.map((b) =>
          b.points.length < 2 ? null : (
            <g key={b.id}>
              <polyline
                points={b.points.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="var(--primary)"
                strokeOpacity={0.85}
                strokeWidth={0.008}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <text x={b.points[0].x} y={b.points[0].y - 0.012} fontSize={0.014} fill="var(--primary)">
                {b.code}
              </text>
            </g>
          ),
        )}

        {cables.map((c) => {
          if (c.branchPoints.length < 2) return null;
          const selected = c.id === selectedCableId;
          const done = c.status === "PULLED";
          const points = c.branchPoints.map((p) => `${p.x},${p.y}`).join(" ");
          return (
            <g key={c.id} onClick={() => onSelectCable(c.id)} style={{ cursor: "pointer" }}>
              <polyline
                points={points}
                fill="none"
                stroke="transparent"
                strokeWidth={0.022}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <polyline
                points={points}
                fill="none"
                stroke={selected ? "var(--destructive)" : done ? "var(--muted-foreground)" : "var(--accent)"}
                strokeOpacity={selected ? 1 : done ? 0.35 : 0.8}
                strokeWidth={selected ? 0.006 : 0.0035}
                strokeLinejoin="round"
              />
            </g>
          );
        })}

        {endpoints.map((ep) => {
          const info = endpointKindInfo(ep.kind);
          const selected = ep.id === selectedEndpointId;
          return (
            <g key={ep.id} onClick={() => onSelectEndpoint(ep.id)} style={{ cursor: "pointer" }}>
              <circle
                cx={ep.x}
                cy={ep.y}
                r={selected ? 0.014 : 0.01}
                fill={info.color}
                stroke={selected ? "var(--destructive)" : "var(--background)"}
                strokeWidth={selected ? 0.004 : 0.002}
              />
              <text x={ep.x} y={ep.y - 0.014} textAnchor="middle" fontSize={0.012} fill="var(--foreground)">
                {ep.code}
              </text>
            </g>
          );
        })}
      </svg>
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
