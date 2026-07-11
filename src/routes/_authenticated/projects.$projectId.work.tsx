import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Circle, MapPinned, PackageOpen, RefreshCw } from "lucide-react";

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
  toEndpointCode: string | null;
  branchPoints: NormPoint[];
  bundleId: string | null;
  notes: string | null;
};

function WorkModePage() {
  const { projectId } = useParams({ from: "/_authenticated/projects/$projectId/work" });
  const qc = useQueryClient();
  const pullDataFn = useServerFn(getPullModeData);
  const setStatusFn = useServerFn(setCablePullStatus);
  const [selectedPlanId, setSelectedPlanId] = useState<string>("");
  const [selectedCableId, setSelectedCableId] = useState<string | null>(null);
  const [onlyTodo, setOnlyTodo] = useState(false);
  const [note, setNote] = useState("");

  const pull = useQuery({
    queryKey: ["pull-mode", projectId],
    queryFn: () => pullDataFn({ data: { projectId, defaultSpoolLengthM: 305 } }),
  });

  const firstPlanId = pull.data?.plans[0]?.id ?? "";
  const activePlanId = selectedPlanId || firstPlanId;
  useEffect(() => {
    if (!selectedPlanId && firstPlanId) setSelectedPlanId(firstPlanId);
  }, [firstPlanId, selectedPlanId]);

  const selectedPlan = pull.data?.plans.find((p) => p.id === activePlanId) ?? null;
  const planCables = useMemo(() => {
    const rows = (pull.data?.cables ?? []).filter((c) => c.floorPlanId === activePlanId);
    return onlyTodo ? rows.filter((c) => c.status !== "PULLED") : rows;
  }, [pull.data?.cables, activePlanId, onlyTodo]);
  const selectedCable =
    planCables.find((c) => c.id === selectedCableId) ??
    planCables.find((c) => c.status !== "PULLED") ??
    planCables[0] ??
    null;

  async function toggleCable(cable: PullCable, done: boolean) {
    try {
      await setStatusFn({ data: { cableId: cable.id, done, note: cable.id === selectedCable?.id ? note : "" } });
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
        <div>
          <h1 className="font-mono text-2xl font-bold uppercase tracking-tight">Režim tahání</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Terénní pohled: mapa tras, dnešní fronta kabelů a simulace spulek.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => pull.refetch()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Obnovit
        </Button>
      </header>

      {pull.isLoading && <div className="text-sm text-muted-foreground">Načítám…</div>}
      {pull.data && (
        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard label="Kabelů" value={String(pull.data.totalCables)} />
            <StatCard label="V trasách" value={String(pull.data.routedCables)} />
            <StatCard label="Hotovo" value={`${pull.data.doneCables}/${pull.data.totalCables}`} />
            <StatCard label="Metry" value={`${pull.data.totalMeters.toFixed(1)} m`} />
            <StatCard label="Spulek" value={String(pull.data.spools.length)} />
          </section>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="overflow-hidden rounded-sm border border-border bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border p-3">
                <div className="flex items-center gap-2">
                  <MapPinned className="h-4 w-4 text-muted-foreground" />
                  <select
                    className="rounded-sm border border-input bg-background px-2 py-1.5 text-sm"
                    value={activePlanId}
                    onChange={(e) => {
                      setSelectedPlanId(e.target.value);
                      setSelectedCableId(null);
                    }}
                  >
                    {pull.data.plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline" className="font-mono">
                    {planCables.length} kabelů
                  </Badge>
                  <Badge variant="secondary" className="font-mono">
                    {pull.data.bundles.filter((b) => b.floorPlanId === activePlanId).length} kmenů
                  </Badge>
                </div>
              </div>
              <PullMap
                plan={selectedPlan}
                bundles={pull.data.bundles.filter((b) => b.floorPlanId === activePlanId)}
                endpoints={pull.data.endpoints.filter((e) => e.floorPlanId === activePlanId)}
                cables={planCables}
                selectedCableId={selectedCable?.id ?? null}
                onSelectCable={setSelectedCableId}
              />
            </section>

            <aside className="space-y-4">
              <section className="rounded-sm border border-border bg-card">
                <div className="flex items-center justify-between border-b border-border p-3">
                  <div className="font-mono text-sm font-semibold uppercase">Fronta tahání</div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={onlyTodo}
                      onChange={(e) => setOnlyTodo(e.target.checked)}
                    />
                    jen nehotové
                  </label>
                </div>
                <div className="max-h-[420px] divide-y divide-border overflow-y-auto">
                  {planCables.map((c) => {
                    const done = c.status === "PULLED";
                    const active = c.id === selectedCable?.id;
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
                            {c.toEndpointCode ?? "bez endpointu"} · {c.typeCode} ·{" "}
                            {c.meters == null ? "bez délky" : `${c.meters.toFixed(1)} m`}
                          </span>
                        </span>
                        <Badge variant={done ? "secondary" : "outline"} className="font-mono text-[10px]">
                          {done ? "HOTOVO" : "TAHAT"}
                        </Badge>
                      </button>
                    );
                  })}
                  {planCables.length === 0 && (
                    <div className="p-6 text-center text-sm text-muted-foreground">
                      Pro tento plán nejsou kabely ve vybraném filtru.
                    </div>
                  )}
                </div>
              </section>

              {selectedCable && (
                <section className="rounded-sm border-2 border-accent bg-card p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-sm font-bold">{selectedCable.code}</div>
                      <div className="text-xs text-muted-foreground">
                        {selectedCable.toEndpointCode ?? "bez endpointu"} · {selectedCable.typeCode}
                      </div>
                    </div>
                    <Badge variant="outline" className="font-mono">
                      {selectedCable.meters == null ? "—" : `${selectedCable.meters.toFixed(1)} m`}
                    </Badge>
                  </div>
                  <Input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Poznámka při odškrtnutí…"
                    className="mb-2"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      onClick={() => toggleCable(selectedCable, true)}
                      disabled={selectedCable.status === "PULLED"}
                    >
                      Hotovo
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleCable(selectedCable, false)}
                      disabled={selectedCable.status !== "PULLED"}
                    >
                      Vrátit
                    </Button>
                  </div>
                  {selectedCable.notes && (
                    <div className="mt-2 whitespace-pre-wrap rounded-sm bg-muted/50 p-2 text-xs text-muted-foreground">
                      {selectedCable.notes}
                    </div>
                  )}
                </section>
              )}
            </aside>
          </div>

          <section className="rounded-sm border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border p-3">
              <PackageOpen className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-mono text-sm font-semibold uppercase">Simulace spulek</h2>
            </div>
            <div className="grid gap-3 p-3 lg:grid-cols-2">
              {pull.data.spools.map((s) => {
                const usedPct = s.capacity > 0 ? Math.min(100, (s.used / s.capacity) * 100) : 0;
                return (
                  <div key={`${s.typeCode}-${s.index}`} className="rounded-sm border border-border p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <Badge variant="outline" className="font-mono">
                        {s.typeCode} · Spulka #{s.index}
                      </Badge>
                      <span className="font-mono text-xs text-muted-foreground">
                        {s.used.toFixed(1)} / {s.capacity.toFixed(0)} m · odpad {s.wasted.toFixed(1)} m
                      </span>
                    </div>
                    <div className="mb-2 h-2 overflow-hidden rounded-sm bg-muted">
                      <div className="h-full bg-accent" style={{ width: `${usedPct}%` }} />
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {s.cables.map((c) => (
                        <Badge key={c.id} variant="secondary" className="font-mono text-[10px]">
                          {c.code} · {c.meters.toFixed(1)} m
                        </Badge>
                      ))}
                    </div>
                  </div>
                );
              })}
              {pull.data.spools.length === 0 && (
                <div className="rounded-sm border border-dashed border-border p-6 text-center text-sm text-muted-foreground lg:col-span-2">
                  Spulky nejde nasimulovat, dokud kabely nemají trasu a kalibraci.
                </div>
              )}
            </div>
          </section>

          <section className="rounded-sm border border-border bg-card p-3">
            <h2 className="mb-2 font-mono text-sm font-semibold uppercase">Odhad času podle typu</h2>
            <div className="grid gap-2 md:grid-cols-3">
              {pull.data.hoursByType.map((r) => (
                <div key={r.typeCode} className="rounded-sm border border-border p-2">
                  <div className="font-mono text-xs font-semibold">{r.typeCode}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {r.meters.toFixed(1)} m · {r.hours == null ? "m/hod není nastaveno" : `${r.hours.toFixed(1)} hod`}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}

function PullMap({
  plan,
  bundles,
  endpoints,
  cables,
  selectedCableId,
  onSelectCable,
}: {
  plan: { name: string; documentUrl: string | null; mimeType: string | null } | null;
  bundles: Array<{ id: string; code: string; points: NormPoint[] }>;
  endpoints: Array<{ id: string; code: string; kind: string | null; x: number; y: number }>;
  cables: PullCable[];
  selectedCableId: string | null;
  onSelectCable: (id: string) => void;
}) {
  return (
    <div className="relative h-[620px] min-h-[480px] bg-muted">
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
                strokeOpacity={0.9}
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
          return (
            <polyline
              key={c.id}
              points={c.branchPoints.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={selected ? "var(--destructive)" : done ? "var(--muted-foreground)" : "var(--accent)"}
              strokeOpacity={selected ? 1 : done ? 0.35 : 0.8}
              strokeWidth={selected ? 0.006 : 0.0035}
              strokeLinejoin="round"
              onClick={() => onSelectCable(c.id)}
              style={{ cursor: "pointer" }}
            />
          );
        })}

        {endpoints.map((ep) => {
          const info = endpointKindInfo(ep.kind);
          return (
            <g key={ep.id}>
              <circle
                cx={ep.x}
                cy={ep.y}
                r={0.01}
                fill={info.color}
                stroke="var(--background)"
                strokeWidth={0.002}
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
      <div className="mt-1 font-mono text-lg font-semibold">{value}</div>
    </div>
  );
}