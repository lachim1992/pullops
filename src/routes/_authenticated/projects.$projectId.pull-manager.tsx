import { useMemo, useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Play, X, CheckCircle2, Cable as CableIcon, ListChecks, History, ChevronLeft, ChevronRight, Search } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getPullManagerState,
  proposePullRoundItems,
  startPullRound,
  completePullRound,
  cancelPullRound,
  listPullRoundsDetail,
} from "@/lib/pullManager.functions";

export const Route = createFileRoute("/_authenticated/projects/$projectId/pull-manager")({
  head: () => ({
    meta: [{ title: "Manažer tahání · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: PullManagerPage,
});

type Pair = {
  fromEndpointId: string;
  toEndpointId: string;
  cableTypeId: string | null;
  plannedLengthM: number | null;
  suggestedSpoolId: string | null;
  spoolId: string | null;
  code: string;
  note: string | null;
};

function PullManagerPage() {
  const { projectId } = useParams({ from: "/_authenticated/projects/$projectId/pull-manager" });
  const qc = useQueryClient();
  const [dayPlanId, setDayPlanId] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<string[]>([]);
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [actuals, setActuals] = useState<Record<string, string>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const [endpointFilter, setEndpointFilter] = useState("");


  const stateFn = useServerFn(getPullManagerState);
  const proposeFn = useServerFn(proposePullRoundItems);
  const startFn = useServerFn(startPullRound);
  const completeFn = useServerFn(completePullRound);
  const cancelFn = useServerFn(cancelPullRound);
  const historyFn = useServerFn(listPullRoundsDetail);

  const state = useQuery({
    queryKey: ["pull-manager", projectId, dayPlanId ?? "none"],
    queryFn: () => stateFn({ data: { projectId, dayPlanId } }),
  });
  const history = useQuery({
    queryKey: ["pull-manager-history", dayPlanId],
    queryFn: () => historyFn({ data: { dayPlanId: dayPlanId! } }),
    enabled: !!dayPlanId,
  });

  const endpoints = state.data?.endpoints ?? [];
  const spools = state.data?.spools ?? [];
  const cableTypes = state.data?.cableTypes ?? [];
  const activeRound = state.data?.activeRound as
    | null
    | { id: string; roundNumber: number; items: any[] };
  const plansList = state.data?.plans ?? [];

  const endpointById = useMemo(() => {
    const m = new Map<string, any>();
    for (const e of endpoints) m.set(e.id, e);
    return m;
  }, [endpoints]);
  const spoolById = useMemo(() => {
    const m = new Map<string, any>();
    for (const s of spools) m.set(s.id, s);
    return m;
  }, [spools]);
  const cableTypeCode = (id: string | null) =>
    id ? (cableTypes.find((t: any) => t.id === id)?.code ?? "—") : "—";

  const spoolCapacity = spools.length;

  function toggleEndpoint(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  async function addPair() {
    if (selected.length !== 2) {
      toast.error("Vyberte právě dva endpointy.");
      return;
    }
    const [a, b] = selected;
    if (pairs.some((p) => (p.fromEndpointId === a && p.toEndpointId === b) || (p.fromEndpointId === b && p.toEndpointId === a))) {
      toast.error("Tato relace už je v seznamu.");
      return;
    }
    // default cable type from either endpoint kind? just null; user picks.
    try {
      const res = await proposeFn({
        data: {
          projectId,
          dayPlanId: dayPlanId!,
          pairs: [{ fromEndpointId: a, toEndpointId: b, cableTypeId: null }],
        },
      });
      const it = res.items[0];
      const epA = endpointById.get(a);
      const epB = endpointById.get(b);
      const code = `${(epA?.code ?? "A").slice(0, 12)}→${(epB?.code ?? "B").slice(0, 12)}`;
      setPairs((prev) => [
        ...prev,
        {
          fromEndpointId: a,
          toEndpointId: b,
          cableTypeId: it.cableTypeId,
          plannedLengthM: it.plannedLengthM,
          suggestedSpoolId: it.suggestedSpoolId,
          spoolId: it.suggestedSpoolId,
          code,
          note: it.note,
        },
      ]);
      setSelected([]);
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba návrhu");
    }
  }

  async function reproposeAll() {
    if (!dayPlanId || pairs.length === 0) return;
    const res = await proposeFn({
      data: {
        projectId,
        dayPlanId,
        pairs: pairs.map((p) => ({
          fromEndpointId: p.fromEndpointId,
          toEndpointId: p.toEndpointId,
          cableTypeId: p.cableTypeId,
        })),
      },
    });
    setPairs((prev) =>
      prev.map((p, i) => ({
        ...p,
        plannedLengthM: res.items[i]?.plannedLengthM ?? null,
        suggestedSpoolId: res.items[i]?.suggestedSpoolId ?? null,
        spoolId: p.spoolId ?? res.items[i]?.suggestedSpoolId ?? null,
        note: res.items[i]?.note ?? null,
      })),
    );
  }

  async function onStartRound() {
    if (!dayPlanId) return;
    if (pairs.length === 0) return toast.error("Přidejte alespoň jednu relaci.");
    if (pairs.length !== spoolCapacity)
      return toast.error(
        `Kolo musí mít přesně tolik kabelů, kolik je cívek přiřazených plánu (${spoolCapacity}).`,
      );
    for (const p of pairs) {
      if (!p.spoolId) return toast.error(`Kabel ${p.code} nemá přiřazenou cívku.`);
    }
    const spoolIds = pairs.map((p) => p.spoolId!);
    if (new Set(spoolIds).size !== spoolIds.length)
      return toast.error("Každá cívka může být použita jen jednou.");
    try {
      await startFn({
        data: {
          projectId,
          dayPlanId,
          items: pairs.map((p) => ({
            fromEndpointId: p.fromEndpointId,
            toEndpointId: p.toEndpointId,
            cableTypeId: p.cableTypeId,
            spoolId: p.spoolId!,
            plannedLengthM: p.plannedLengthM,
            code: p.code,
          })),
        },
      });
      toast.success("Kolo tahání spuštěno.");
      setPairs([]);
      setSelected([]);
      qc.invalidateQueries({ queryKey: ["pull-manager", projectId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba spuštění kola");
    }
  }

  async function onCompleteRound() {
    if (!activeRound) return;
    try {
      await completeFn({
        data: {
          roundId: activeRound.id,
          actuals: activeRound.items.map((it: any) => ({
            itemId: it.id,
            actualLengthM: actuals[it.id] ? Number(actuals[it.id]) : null,
          })),
        },
      });
      toast.success("Kolo dokončeno.");
      setActuals({});
      qc.invalidateQueries({ queryKey: ["pull-manager", projectId] });
      qc.invalidateQueries({ queryKey: ["pull-manager-history", dayPlanId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Chyba dokončení kola");
    }
  }

  async function onCancelRound() {
    if (!activeRound) return;
    if (!confirm("Opravdu zrušit toto kolo?")) return;
    await cancelFn({ data: { roundId: activeRound.id } });
    toast.success("Kolo zrušeno.");
    qc.invalidateQueries({ queryKey: ["pull-manager", projectId] });
    qc.invalidateQueries({ queryKey: ["pull-manager-history", dayPlanId] });
  }

  return (
    <AppShell projectId={projectId}>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold">Manažer tahání</h1>
          <div className="ml-auto flex items-center gap-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">
              Plán
            </Label>
            <Select value={dayPlanId ?? ""} onValueChange={(v) => setDayPlanId(v || undefined)}>
              <SelectTrigger className="w-72">
                <SelectValue placeholder="Vyberte plán tahání…" />
              </SelectTrigger>
              <SelectContent>
                {plansList.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.planned_date ? ` · ${p.planned_date}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!dayPlanId ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              Vyberte plán tahání pro pokračování. Cívky přiřazené k plánu určují, kolik kabelů
              se v jednom kole potáhne.
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue={activeRound ? "active" : "build"} className="space-y-4">
            <TabsList>
              <TabsTrigger value="build">
                <MapPin className="h-4 w-4 mr-1" /> Mapa & výběr
              </TabsTrigger>
              <TabsTrigger value="active" disabled={!activeRound}>
                <CableIcon className="h-4 w-4 mr-1" /> Aktuální kolo
                {activeRound ? ` · #${activeRound.roundNumber}` : ""}
              </TabsTrigger>
              <TabsTrigger value="queue">
                <History className="h-4 w-4 mr-1" /> Fronta kol
              </TabsTrigger>
            </TabsList>

            <TabsContent value="build" className="space-y-4">
              <Card>
                <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
                  <CardTitle className="text-base">
                    Endpointy ({endpoints.length}) — vyberte dva a přidejte relaci
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      Cívky na plánu: {spoolCapacity}
                    </Badge>
                    <Badge variant={pairs.length === spoolCapacity ? "default" : "outline"}>
                      Kabelů v kole: {pairs.length}/{spoolCapacity}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-72 overflow-y-auto">
                    {endpoints.map((e: any) => {
                      const sel = selected.includes(e.id);
                      return (
                        <button
                          key={e.id}
                          onClick={() => toggleEndpoint(e.id)}
                          className={`text-left px-2 py-1.5 rounded border text-xs ${
                            sel
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-card hover:bg-muted border-border"
                          }`}
                        >
                          <div className="font-mono font-medium truncate">{e.code}</div>
                          <div className="truncate opacity-70">{e.label ?? e.endpoint_kind ?? "—"}</div>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      Vybráno: {selected.map((id) => endpointById.get(id)?.code ?? "?").join(" ↔ ") || "—"}
                    </Badge>
                    <Button size="sm" onClick={addPair} disabled={selected.length !== 2 || !!activeRound}>
                      Spojit vybrané → kabel
                    </Button>
                    {pairs.length > 0 && (
                      <Button size="sm" variant="outline" onClick={reproposeAll}>
                        Přepočítat návrh
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {pairs.length > 0 && (
                <Card>
                  <CardHeader className="flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-base">Kabely v kole</CardTitle>
                    <Button
                      size="sm"
                      onClick={onStartRound}
                      disabled={!!activeRound || pairs.length !== spoolCapacity}
                    >
                      <Play className="h-4 w-4 mr-1" /> Spustit kolo
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {pairs.map((p, i) => {
                      const epA = endpointById.get(p.fromEndpointId);
                      const epB = endpointById.get(p.toEndpointId);
                      return (
                        <div
                          key={`${p.fromEndpointId}-${p.toEndpointId}`}
                          className="grid grid-cols-12 gap-2 items-center border rounded p-2"
                        >
                          <div className="col-span-3 text-sm">
                            <div className="font-mono text-xs">{p.code}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {epA?.code} → {epB?.code}
                            </div>
                          </div>
                          <div className="col-span-2">
                            <Select
                              value={p.cableTypeId ?? "none"}
                              onValueChange={(v) => {
                                const val = v === "none" ? null : v;
                                setPairs((prev) =>
                                  prev.map((x, idx) => (idx === i ? { ...x, cableTypeId: val } : x)),
                                );
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Typ" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">— žádný —</SelectItem>
                                {cableTypes.map((t: any) => (
                                  <SelectItem key={t.id} value={t.id}>
                                    {t.code}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-2 text-sm">
                            {p.plannedLengthM != null ? `${p.plannedLengthM.toFixed(1)} m` : "— m"}
                            {p.note && (
                              <div className="text-[10px] text-amber-600">{p.note}</div>
                            )}
                          </div>
                          <div className="col-span-4">
                            <Select
                              value={p.spoolId ?? "none"}
                              onValueChange={(v) => {
                                const val = v === "none" ? null : v;
                                setPairs((prev) =>
                                  prev.map((x, idx) => (idx === i ? { ...x, spoolId: val } : x)),
                                );
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Cívka" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">— nepřiřazeno —</SelectItem>
                                {spools.map((s: any) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {s.serial_no} · {cableTypeCode(s.cable_type_id)} · zb.{" "}
                                    {Number(s.current_length_m).toFixed(0)} m
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-1 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() =>
                                setPairs((prev) => prev.filter((_, idx) => idx !== i))
                              }
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="active" className="space-y-3">
              {!activeRound ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    Žádné běžící kolo. Vytvořte kabely v záložce „Mapa & výběr" a spusťte kolo.
                  </CardContent>
                </Card>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <Badge>Kolo #{activeRound.roundNumber}</Badge>
                    <div className="ml-auto flex gap-2">
                      <Button size="sm" variant="destructive" onClick={onCancelRound}>
                        Zrušit kolo
                      </Button>
                      <Button size="sm" onClick={onCompleteRound}>
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Ukončit kolo
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {activeRound.items.map((it: any, idx: number) => {
                      const spool = spoolById.get(it.spool_id);
                      return (
                        <Card key={it.id}>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center justify-between">
                              <span>#{idx + 1} · Cívka {spool?.serial_no ?? it.spool_id.slice(0, 6)}</span>
                              <Badge variant="outline">
                                {it.status === "DONE" ? "Hotovo" : "Čeká"}
                              </Badge>
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="text-sm space-y-2">
                            <div className="text-xs text-muted-foreground">
                              Kabel <span className="font-mono">{it.cable_id.slice(0, 8)}</span>
                            </div>
                            <div>
                              Plánovaná délka:{" "}
                              <strong>
                                {it.planned_length_m != null
                                  ? `${Number(it.planned_length_m).toFixed(1)} m`
                                  : "—"}
                              </strong>
                            </div>
                            <div className="flex items-center gap-2">
                              <Label className="text-xs">Skutečné m</Label>
                              <Input
                                type="number"
                                step="0.1"
                                className="h-8 w-28"
                                value={actuals[it.id] ?? ""}
                                onChange={(e) =>
                                  setActuals((prev) => ({ ...prev, [it.id]: e.target.value }))
                                }
                                placeholder={
                                  it.planned_length_m != null
                                    ? Number(it.planned_length_m).toFixed(1)
                                    : ""
                                }
                              />
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="queue">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Historie kol</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {(history.data?.rounds ?? []).length === 0 && (
                    <div className="text-sm text-muted-foreground">Zatím žádné kolo.</div>
                  )}
                  {(history.data?.rounds ?? []).map((r: any) => {
                    const items = (history.data?.items ?? []).filter(
                      (it: any) => it.round_id === r.id,
                    );
                    return (
                      <div key={r.id} className="border rounded p-3 space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Badge>#{r.round_number}</Badge>
                          <Badge
                            variant={
                              r.status === "COMPLETED"
                                ? "default"
                                : r.status === "CANCELLED"
                                  ? "destructive"
                                  : "outline"
                            }
                          >
                            {r.status}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {r.started_at ? new Date(r.started_at).toLocaleString("cs-CZ") : ""}
                            {r.completed_at
                              ? ` → ${new Date(r.completed_at).toLocaleString("cs-CZ")}`
                              : ""}
                          </span>
                          <span className="ml-auto text-xs">{items.length} kabelů</span>
                        </div>
                        <div className="grid gap-1 text-xs">
                          {items.map((it: any) => (
                            <div
                              key={it.id}
                              className="grid grid-cols-4 gap-2 border-t pt-1 font-mono"
                            >
                              <span>#{it.sequence}</span>
                              <span>cívka {it.spool_id.slice(0, 6)}</span>
                              <span>
                                plán {it.planned_length_m != null ? Number(it.planned_length_m).toFixed(1) : "—"} m
                              </span>
                              <span>
                                skut. {it.actual_length_m != null ? Number(it.actual_length_m).toFixed(1) : "—"} m
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppShell>
  );
}
