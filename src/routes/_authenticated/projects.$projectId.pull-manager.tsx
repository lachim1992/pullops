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
            <TabsList className="h-12">
              <TabsTrigger value="build" className="text-base px-4">
                <ListChecks className="h-5 w-5 mr-2" /> Výběr
              </TabsTrigger>
              <TabsTrigger value="active" disabled={!activeRound} className="text-base px-4">
                <CableIcon className="h-5 w-5 mr-2" /> Aktuální kolo

                {activeRound ? ` · #${activeRound.roundNumber}` : ""}
              </TabsTrigger>
              <TabsTrigger value="queue" className="text-base px-4">
                <History className="h-5 w-5 mr-2" /> Fronta kol
              </TabsTrigger>

            </TabsList>

            <TabsContent value="build" className="space-y-4">
              <Card>
                <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 flex-wrap">
                  <CardTitle className="text-lg">
                    Krok 1 — Vyberte endpointy ({endpoints.length})
                  </CardTitle>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-sm">
                      Cívky na plánu: {spoolCapacity}
                    </Badge>
                    <Badge variant={pairs.length === spoolCapacity ? "default" : "outline"} className="text-sm">
                      Kabelů v kole: {pairs.length}/{spoolCapacity}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input
                      value={endpointFilter}
                      onChange={(e) => setEndpointFilter(e.target.value)}
                      placeholder="Hledat kód, popisek, patro, místnost…"
                      className="pl-9 h-11 text-base"
                    />
                  </div>
                  <div className="rounded-md border divide-y max-h-[55vh] overflow-y-auto">
                    {endpoints
                      .filter((e: any) => {
                        const q = endpointFilter.trim().toLowerCase();
                        if (!q) return true;
                        return [e.code, e.label, e.endpoint_kind]
                          .filter(Boolean)
                          .some((v: string) => String(v).toLowerCase().includes(q));
                      })
                      .map((e: any) => {
                        const sel = selected.includes(e.id);
                        const order = sel ? selected.indexOf(e.id) + 1 : null;
                        return (
                          <button
                            key={e.id}
                            onClick={() => toggleEndpoint(e.id)}
                            className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors ${
                              sel
                                ? "bg-primary/10 hover:bg-primary/15"
                                : "bg-card hover:bg-muted"
                            }`}
                          >
                            <div
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border-2 font-mono text-sm font-bold ${
                                sel
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "border-border text-muted-foreground"
                              }`}
                            >
                              {order ?? ""}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-mono font-semibold text-base truncate">{e.code}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {e.label ?? "—"} · {e.endpoint_kind ?? "—"}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <div className="flex-1 rounded-md border bg-muted/40 px-3 py-2 font-mono text-sm min-h-[42px] flex items-center">
                      {selected.length === 0
                        ? "Vyberte první endpoint…"
                        : selected.length === 1
                          ? `${endpointById.get(selected[0])?.code} ↔ ?`
                          : `${endpointById.get(selected[0])?.code} ↔ ${endpointById.get(selected[1])?.code}`}
                    </div>
                    <Button
                      size="lg"
                      className="h-12 text-base"
                      onClick={addPair}
                      disabled={selected.length !== 2 || !!activeRound}
                    >
                      Spojit → kabel
                    </Button>
                    {pairs.length > 0 && (
                      <Button size="lg" variant="outline" className="h-12" onClick={reproposeAll}>
                        Přepočítat
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>



              {pairs.length > 0 && (
                <Card>
                  <CardHeader className="flex-row items-center justify-between space-y-0 flex-wrap gap-2">
                    <CardTitle className="text-lg">Krok 2 — Kabely a cívky</CardTitle>
                    <Button
                      size="lg"
                      className="h-12 text-base"
                      onClick={onStartRound}
                      disabled={!!activeRound || pairs.length !== spoolCapacity}
                    >
                      <Play className="h-5 w-5 mr-2" /> Spustit kolo
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
                    Žádné běžící kolo. Vytvořte kabely v záložce „Výběr" a spusťte kolo.
                  </CardContent>
                </Card>
              ) : (() => {
                const items = activeRound.items ?? [];
                const total = items.length;
                const doneCount = items.filter((x: any) => x.status === "DONE" || actuals[x.id] || x.actual_length_m != null).length;
                const idx = Math.min(activeIndex, Math.max(0, total - 1));
                const it = items[idx];
                const spool = it ? spoolById.get(it.spool_id) : null;
                const epA = it ? endpointById.get(it.from_endpoint_id) : null;
                const epB = it ? endpointById.get(it.to_endpoint_id) : null;
                const planned = it?.planned_length_m != null ? Number(it.planned_length_m) : null;
                const actualStr = it ? (actuals[it.id] ?? (it.actual_length_m != null ? String(it.actual_length_m) : "")) : "";
                const setActual = (v: string) => it && setActuals((prev) => ({ ...prev, [it.id]: v }));
                const bump = (delta: number) => {
                  const base = actualStr ? Number(actualStr) : planned ?? 0;
                  const next = Math.max(0, Math.round((base + delta) * 10) / 10);
                  setActual(String(next));
                };
                return (
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className="text-sm">Kolo #{activeRound.roundNumber}</Badge>
                      <Badge variant="outline" className="text-sm">
                        Hotovo {doneCount}/{total}
                      </Badge>
                      <div className="ml-auto flex gap-2">
                        <Button size="lg" variant="destructive" className="h-11" onClick={onCancelRound}>
                          Zrušit kolo
                        </Button>
                        <Button
                          size="lg"
                          className="h-11 text-base"
                          onClick={onCompleteRound}
                        >
                          <CheckCircle2 className="h-5 w-5 mr-2" /> Ukončit kolo
                        </Button>
                      </div>
                    </div>

                    {it && (
                      <Card className="border-2 border-primary/40">
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <CardTitle className="text-2xl font-mono">
                              Kabel {idx + 1} / {total}
                            </CardTitle>
                            <Badge
                              variant={it.status === "DONE" ? "default" : "outline"}
                              className="text-sm"
                            >
                              {it.status === "DONE" ? "Hotovo" : "Čeká"}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-5">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-lg border bg-muted/30 p-4">
                              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                                Kabel
                              </div>
                              <div className="font-mono text-xl font-bold">
                                {it.cable_code ?? it.cable_id.slice(0, 8)}
                              </div>
                              <div className="mt-2 font-mono text-base">
                                {epA?.code ?? "?"} <span className="text-muted-foreground">→</span>{" "}
                                {epB?.code ?? "?"}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {(epA?.label || epA?.endpoint_kind) ?? ""}
                                {epB?.label || epB?.endpoint_kind ? ` → ${epB?.label ?? epB?.endpoint_kind}` : ""}
                              </div>
                            </div>
                            <div className="rounded-lg border bg-muted/30 p-4">
                              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                                Cívka
                              </div>
                              <div className="font-mono text-xl font-bold">
                                {spool?.serial_no ?? it.spool_id.slice(0, 6)}
                              </div>
                              <div className="text-sm mt-2">
                                Typ: <span className="font-mono">{cableTypeCode(spool?.cable_type_id ?? null)}</span>
                              </div>
                              <div className="text-sm">
                                Zbývá:{" "}
                                <span className="font-mono font-semibold">
                                  {spool?.current_length_m != null
                                    ? `${Number(spool.current_length_m).toFixed(0)} m`
                                    : "—"}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-lg border p-4 space-y-3">
                            <div className="flex items-baseline justify-between">
                              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                                Plánovaná délka
                              </div>
                              <div className="font-mono text-3xl font-bold">
                                {planned != null ? `${planned.toFixed(1)} m` : "—"}
                              </div>
                            </div>
                            <Label className="text-sm font-semibold">Skutečně nataženo (m)</Label>
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                className="h-14 w-14 text-2xl font-bold shrink-0"
                                onClick={() => bump(-1)}
                              >
                                −
                              </Button>
                              <Input
                                inputMode="decimal"
                                type="number"
                                step="0.1"
                                className="h-14 text-2xl font-mono text-center"
                                value={actualStr}
                                onChange={(e) => setActual(e.target.value)}
                                placeholder={planned != null ? planned.toFixed(1) : "0.0"}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                className="h-14 w-14 text-2xl font-bold shrink-0"
                                onClick={() => bump(1)}
                              >
                                +
                              </Button>
                            </div>
                            {planned != null && (
                              <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="secondary" onClick={() => setActual(planned.toFixed(1))}>
                                  = plán ({planned.toFixed(1)} m)
                                </Button>
                                <Button size="sm" variant="secondary" onClick={() => bump(0.5)}>
                                  +0,5 m
                                </Button>
                                <Button size="sm" variant="secondary" onClick={() => bump(5)}>
                                  +5 m
                                </Button>
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="lg"
                              className="h-12 flex-1"
                              onClick={() => setActiveIndex((n) => Math.max(0, n - 1))}
                              disabled={idx === 0}
                            >
                              <ChevronLeft className="h-5 w-5 mr-1" /> Předchozí
                            </Button>
                            <Button
                              size="lg"
                              className="h-12 flex-1"
                              onClick={() => setActiveIndex((n) => Math.min(total - 1, n + 1))}
                              disabled={idx >= total - 1}
                            >
                              Další <ChevronRight className="h-5 w-5 ml-1" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                      {items.map((x: any, i: number) => {
                        const active = i === idx;
                        const hasActual = !!actuals[x.id] || x.actual_length_m != null;
                        return (
                          <button
                            key={x.id}
                            onClick={() => setActiveIndex(i)}
                            className={`text-left rounded-md border p-2 transition-colors ${
                              active
                                ? "border-primary bg-primary/10"
                                : hasActual
                                  ? "border-green-500/40 bg-green-500/5"
                                  : "hover:bg-muted"
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-mono font-bold">#{i + 1}</span>
                              <span className="text-muted-foreground">
                                {hasActual ? "✓" : x.planned_length_m != null ? `${Number(x.planned_length_m).toFixed(0)} m` : ""}
                              </span>
                            </div>
                            <div className="mt-1 font-mono text-xs truncate">
                              {x.cable_code ?? x.cable_id.slice(0, 6)}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
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
