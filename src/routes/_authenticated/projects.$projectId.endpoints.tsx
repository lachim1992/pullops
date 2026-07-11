import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2, Upload, CheckCircle2, Circle, Plus, X } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteEndpoint,
  getEndpoint,
  listEndpoints,
  updateEndpoint,
} from "@/lib/endpoints.functions";
import { getFloorPlan, listFloorPlans } from "@/lib/floorPlans.functions";
import {
  deleteEndpointPhoto,
  listEndpointPhotos,
  registerEndpointPhoto,
} from "@/lib/endpointPhotos.functions";
import {
  createEndpointComment,
  deleteEndpointComment,
  listEndpointComments,
  setEndpointCommentResolved,
} from "@/lib/endpointComments.functions";
import { useEndpointKinds } from "@/hooks/useEndpointKinds";

export const Route = createFileRoute("/_authenticated/projects/$projectId/endpoints")({
  head: () => ({
    meta: [{ title: "Endpointy · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: EndpointsPage,
});

function EndpointsPage() {
  const { projectId } = useParams({
    from: "/_authenticated/projects/$projectId/endpoints",
  });
  const listFn = useServerFn(listEndpoints);
  const listPlansFn = useServerFn(listFloorPlans);
  const qc = useQueryClient();

  const [selectedPlanId, setSelectedPlanId] = useState<string | "ALL">("ALL");
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(null);
  const kindsQuery = useEndpointKinds(projectId);
  const kindMap = useMemo(() => {
    const m = new Map<string, { label: string; color: string }>();
    (kindsQuery.data ?? []).forEach((k) =>
      m.set(k.code, { label: k.label, color: k.color ?? "hsl(0 0% 40%)" }),
    );
    return m;
  }, [kindsQuery.data]);

  const plans = useQuery({
    queryKey: ["plans", projectId],
    queryFn: () => listPlansFn({ data: { projectId } }),
  });
  const eps = useQuery({
    queryKey: ["endpoints", projectId],
    queryFn: () => listFn({ data: { projectId } }),
  });

  const filtered = useMemo(() => {
    const all = eps.data ?? [];
    return selectedPlanId === "ALL" ? all : all.filter((e) => e.floor_plan_id === selectedPlanId);
  }, [eps.data, selectedPlanId]);

  return (
    <AppShell projectId={projectId}>
      <header className="mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Endpointy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Přehled koncových bodů — filtrujte podle plánu, klikněte pro detail, fotky a poznámky.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_360px]">
        {/* Plans list */}
        <aside className="space-y-1 rounded-sm border border-border bg-card p-2">
          <div className="mb-2 px-2 py-1 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Plány
          </div>
          <button
            onClick={() => setSelectedPlanId("ALL")}
            className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted ${
              selectedPlanId === "ALL" ? "bg-muted font-medium" : ""
            }`}
          >
            <span>Všechny</span>
            <Badge variant="outline" className="font-mono text-xs">
              {eps.data?.length ?? 0}
            </Badge>
          </button>
          {(plans.data ?? []).map((p) => {
            const count = (eps.data ?? []).filter((e) => e.floor_plan_id === p.id).length;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedPlanId(p.id)}
                className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-muted ${
                  selectedPlanId === p.id ? "bg-muted font-medium" : ""
                }`}
              >
                <span className="truncate">{p.name}</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {count}
                </Badge>
              </button>
            );
          })}
        </aside>

        {/* Mini plan preview */}
        <section className="rounded-sm border border-border bg-card">
          {selectedPlanId === "ALL" ? (
            <EndpointsTable
              endpoints={filtered}
              plans={plans.data ?? []}
              kindMap={kindMap}
              selectedId={selectedEndpointId}
              onSelect={setSelectedEndpointId}
            />
          ) : (
            <PlanPreview
              planId={selectedPlanId}
              endpoints={filtered}
              kindMap={kindMap}
              selectedId={selectedEndpointId}
              onSelect={setSelectedEndpointId}
            />
          )}
        </section>

        {/* Detail panel */}
        <aside className="rounded-sm border border-border bg-card p-3">
          {selectedEndpointId ? (
            <EndpointDetail
              key={selectedEndpointId}
              endpointId={selectedEndpointId}
              projectId={projectId}
              kindMap={kindMap}
              onDeleted={() => {
                setSelectedEndpointId(null);
                qc.invalidateQueries({ queryKey: ["endpoints", projectId] });
              }}
            />
          ) : (
            <div className="text-sm text-muted-foreground">
              Vyberte endpoint v seznamu nebo na plánu.
            </div>
          )}
        </aside>
      </div>
    </AppShell>
  );
}

function EndpointsTable({
  endpoints,
  plans,
  kindMap,
  selectedId,
  onSelect,
}: {
  endpoints: Array<{
    id: string;
    code: string;
    label: string | null;
    endpoint_kind: string;
    floor_plan_id: string;
  }>;
  plans: Array<{ id: string; name: string }>;
  kindMap: Map<string, { label: string; color: string }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const planName = (id: string) => plans.find((p) => p.id === id)?.name ?? "—";
  if (endpoints.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Zatím žádný endpoint. Přejděte do editoru plánu a klikáním je přidejte.
      </div>
    );
  }
  return (
    <div className="max-h-[70vh] overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted/70 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground backdrop-blur">
          <tr>
            <th className="p-2">Kód</th>
            <th className="p-2">Popis</th>
            <th className="p-2">Typ</th>
            <th className="p-2">Plán</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {endpoints.map((e) => {
            const k = kindMap.get(e.endpoint_kind);
            return (
              <tr
                key={e.id}
                onClick={() => onSelect(e.id)}
                className={`cursor-pointer hover:bg-muted ${selectedId === e.id ? "bg-muted" : ""}`}
              >
                <td className="p-2 font-mono">{e.code}</td>
                <td className="p-2">{e.label ?? "—"}</td>
                <td className="p-2">
                  <span
                    className="inline-block h-2 w-2 rounded-full align-middle"
                    style={{ background: k?.color ?? "hsl(0 0% 40%)" }}
                  />{" "}
                  <span className="align-middle font-mono text-xs">
                    {k?.label ?? e.endpoint_kind}
                  </span>
                </td>
                <td className="p-2">{planName(e.floor_plan_id)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PlanPreview({
  planId,
  endpoints,
  kindMap,
  selectedId,
  onSelect,
}: {
  planId: string;
  endpoints: Array<{
    id: string;
    code: string;
    endpoint_kind: string;
    norm_x: number;
    norm_y: number;
  }>;
  kindMap: Map<string, { label: string; color: string }>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const getPlanFn = useServerFn(getFloorPlan);
  const plan = useQuery({
    queryKey: ["plan", planId],
    queryFn: () => getPlanFn({ data: { id: planId } }),
  });
  const url = plan.data?.documentUrl ?? null;
  return (
    <div className="relative">
      <div className="flex items-center justify-between border-b border-border p-2">
        <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          {plan.data?.plan?.name ?? "…"}
        </div>
        <Badge variant="outline" className="font-mono text-xs">
          {endpoints.length} bodů
        </Badge>
      </div>
      <div className="relative aspect-[4/3] max-h-[70vh] w-full bg-muted/30">
        {url ? (
          <img src={url} alt="" className="absolute inset-0 h-full w-full object-contain" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {plan.isLoading ? "Načítám…" : "Bez nahraného výkresu"}
          </div>
        )}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {endpoints.map((e) => {
            const c = kindMap.get(e.endpoint_kind)?.color ?? "hsl(0 0% 40%)";
            const sel = selectedId === e.id;
            return (
              <g key={e.id} style={{ cursor: "pointer" }} onClick={() => onSelect(e.id)}>
                <circle
                  cx={e.norm_x * 100}
                  cy={e.norm_y * 100}
                  r={sel ? 1.2 : 0.7}
                  fill={c}
                  stroke="white"
                  strokeWidth={sel ? 0.5 : 0.3}
                  vectorEffect="non-scaling-stroke"
                />
                {sel && (
                  <text
                    x={e.norm_x * 100}
                    y={e.norm_y * 100 - 2}
                    fontSize="2"
                    textAnchor="middle"
                    fill="hsl(var(--foreground))"
                    style={{ paintOrder: "stroke", stroke: "white", strokeWidth: 0.5 }}
                  >
                    {e.code}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

type CustomAttr = { key: string; value: string };
type RefPoint = { label: string; distanceM: number };

function EndpointDetail({
  endpointId,
  projectId,
  kindMap,
  onDeleted,
}: {
  endpointId: string;
  projectId: string;
  kindMap: Map<string, { label: string; color: string }>;
  onDeleted: () => void;
}) {
  const getFn = useServerFn(getEndpoint);
  const updateFn = useServerFn(updateEndpoint);
  const delFn = useServerFn(deleteEndpoint);
  const qc = useQueryClient();

  const detail = useQuery({
    queryKey: ["endpoint", endpointId],
    queryFn: () => getFn({ data: { id: endpointId } }),
  });

  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [customerCode, setCustomerCode] = useState("");
  const [room, setRoom] = useState("");
  const [floor, setFloor] = useState("");
  const [attrs, setAttrs] = useState<CustomAttr[]>([]);
  const [refs, setRefs] = useState<RefPoint[]>([]);

  useEffect(() => {
    const d: any = detail.data;
    if (!d) return;
    setLabel(d.label ?? "");
    setDescription(d.description ?? "");
    setCustomerCode(d.customer_code ?? "");
    setRoom(d.room ?? "");
    setFloor(d.floor ?? "");
    setAttrs(Array.isArray(d.custom_attrs) ? d.custom_attrs : []);
    setRefs(Array.isArray(d.reference_points) ? d.reference_points : []);
  }, [detail.data]);

  async function save() {
    try {
      await updateFn({
        data: {
          id: endpointId,
          label: label || null,
          description: description || null,
          customerCode: customerCode || null,
          room: room || null,
          floor: floor || null,
          customAttrs: attrs.filter((a) => a.key.trim()),
          referencePoints: refs.filter((r) => r.label.trim()),
        },
      });
      toast.success("Uloženo");
      qc.invalidateQueries({ queryKey: ["endpoint", endpointId] });
      qc.invalidateQueries({ queryKey: ["endpoints", projectId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  async function remove() {
    if (!confirm("Smazat endpoint?")) return;
    try {
      await delFn({ data: { id: endpointId } });
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  if (detail.isLoading || !detail.data) {
    return <div className="text-sm text-muted-foreground">Načítám…</div>;
  }
  const d: any = detail.data;
  const kind = kindMap.get(d.endpoint_kind);

  return (
    <div className="max-h-[75vh] space-y-4 overflow-auto pr-1">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-mono text-lg">{d.code}</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: kind?.color ?? "hsl(0 0% 40%)" }}
            />
            {kind?.label ?? d.endpoint_kind}
          </div>
        </div>
        <Button size="icon" variant="ghost" onClick={remove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        <div>
          <Label className="text-xs">Popis / název</Label>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Zákaznický kód</Label>
          <Input
            value={customerCode}
            onChange={(e) => setCustomerCode(e.target.value)}
            placeholder="např. D1.14"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Místnost</Label>
            <Input value={room} onChange={(e) => setRoom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Patro</Label>
            <Input value={floor} onChange={(e) => setFloor(e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="text-xs">Poznámka</Label>
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
      </div>

      <AttrsEditor
        title="Vlastní atributy"
        items={attrs}
        onChange={setAttrs}
        placeholderA="výška"
        placeholderB="2.5 m"
      />

      <div>
        <div className="mb-1 flex items-center justify-between">
          <Label className="text-xs">Referenční body (zdi / rohy)</Label>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setRefs((r) => [...r, { label: "", distanceM: 0 }])}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="space-y-1">
          {refs.map((r, i) => (
            <div key={i} className="flex items-center gap-1">
              <Input
                value={r.label}
                onChange={(e) => {
                  const copy = [...refs];
                  copy[i] = { ...copy[i], label: e.target.value };
                  setRefs(copy);
                }}
                placeholder="např. severní zeď"
                className="flex-1"
              />
              <Input
                type="number"
                step="0.01"
                value={r.distanceM}
                onChange={(e) => {
                  const copy = [...refs];
                  copy[i] = { ...copy[i], distanceM: Number(e.target.value) || 0 };
                  setRefs(copy);
                }}
                placeholder="m"
                className="w-20"
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setRefs((rs) => rs.filter((_, j) => j !== i))}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {refs.length === 0 && (
            <div className="text-xs text-muted-foreground">
              Přidejte vzdálenosti od zdí / rohů pro přesnou pozici v místnosti.
            </div>
          )}
        </div>
      </div>

      <Button className="w-full" onClick={save}>
        Uložit specifikaci
      </Button>

      <PhotosSection endpointId={endpointId} projectId={projectId} />
      <CommentsSection endpointId={endpointId} />
    </div>
  );
}

function AttrsEditor({
  title,
  items,
  onChange,
  placeholderA,
  placeholderB,
}: {
  title: string;
  items: CustomAttr[];
  onChange: (v: CustomAttr[]) => void;
  placeholderA: string;
  placeholderB: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <Label className="text-xs">{title}</Label>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onChange([...items, { key: "", value: "" }])}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="space-y-1">
        {items.map((a, i) => (
          <div key={i} className="flex items-center gap-1">
            <Input
              value={a.key}
              onChange={(e) => {
                const c = [...items];
                c[i] = { ...c[i], key: e.target.value };
                onChange(c);
              }}
              placeholder={placeholderA}
              className="flex-1"
            />
            <Input
              value={a.value}
              onChange={(e) => {
                const c = [...items];
                c[i] = { ...c[i], value: e.target.value };
                onChange(c);
              }}
              placeholder={placeholderB}
              className="flex-1"
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function PhotosSection({ endpointId, projectId }: { endpointId: string; projectId: string }) {
  const listFn = useServerFn(listEndpointPhotos);
  const regFn = useServerFn(registerEndpointPhoto);
  const delFn = useServerFn(deleteEndpointPhoto);
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const photos = useQuery({
    queryKey: ["endpoint-photos", endpointId],
    queryFn: () => listFn({ data: { endpointId } }),
  });

  async function onFile(f: File) {
    setUploading(true);
    try {
      const ext = f.name.split(".").pop() ?? "jpg";
      const path = `${projectId}/${endpointId}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("endpoint-photos")
        .upload(path, f, { upsert: false, contentType: f.type });
      if (error) throw error;
      await regFn({ data: { endpointId, storagePath: path } });
      qc.invalidateQueries({ queryKey: ["endpoint-photos", endpointId] });
      toast.success("Fotka nahrána");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba nahrávání");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(id: string) {
    if (!confirm("Smazat fotku?")) return;
    try {
      await delFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["endpoint-photos", endpointId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Label className="text-xs">Fotky</Label>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
        >
          <Upload className="mr-1 h-3.5 w-3.5" />
          {uploading ? "Nahrávám…" : "Nahrát"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(photos.data ?? []).map((p) => (
          <div
            key={p.id}
            className="group relative overflow-hidden rounded-sm border border-border"
          >
            {p.url ? (
              <img src={p.url} alt="" className="aspect-square w-full object-cover" />
            ) : (
              <div className="aspect-square w-full bg-muted" />
            )}
            <button
              onClick={() => remove(p.id)}
              className="absolute right-1 top-1 rounded-sm bg-background/80 p-1 opacity-0 transition-opacity group-hover:opacity-100"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        {(photos.data ?? []).length === 0 && (
          <div className="col-span-2 rounded-sm border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Žádné fotky
          </div>
        )}
      </div>
    </div>
  );
}

function CommentsSection({ endpointId }: { endpointId: string }) {
  const listFn = useServerFn(listEndpointComments);
  const createFn = useServerFn(createEndpointComment);
  const resolveFn = useServerFn(setEndpointCommentResolved);
  const delFn = useServerFn(deleteEndpointComment);
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [showResolved, setShowResolved] = useState(false);

  const comments = useQuery({
    queryKey: ["endpoint-comments", endpointId],
    queryFn: () => listFn({ data: { endpointId } }),
  });

  async function submit() {
    if (!body.trim()) return;
    try {
      await createFn({ data: { endpointId, body: body.trim() } });
      setBody("");
      qc.invalidateQueries({ queryKey: ["endpoint-comments", endpointId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }
  async function toggle(id: string, resolved: boolean) {
    try {
      await resolveFn({ data: { id, resolved } });
      qc.invalidateQueries({ queryKey: ["endpoint-comments", endpointId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }
  async function remove(id: string) {
    if (!confirm("Smazat komentář?")) return;
    try {
      await delFn({ data: { id } });
      qc.invalidateQueries({ queryKey: ["endpoint-comments", endpointId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  const all = comments.data ?? [];
  const visible = showResolved ? all : all.filter((c) => !c.resolved);
  const openCount = all.filter((c) => !c.resolved).length;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Label className="text-xs">
          Komentáře{" "}
          {openCount > 0 && (
            <Badge variant="destructive" className="ml-1 font-mono text-xs">
              {openCount}
            </Badge>
          )}
        </Label>
        <button
          onClick={() => setShowResolved((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {showResolved ? "Skrýt vyřešené" : "Zobrazit vše"}
        </button>
      </div>
      <div className="space-y-2">
        {visible.map((c) => (
          <div
            key={c.id}
            className={`rounded-sm border border-border p-2 text-sm ${
              c.resolved ? "opacity-60" : ""
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 whitespace-pre-wrap break-words">{c.body}</div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => toggle(c.id, !c.resolved)}
                  title={c.resolved ? "Označit nevyřešené" : "Označit vyřešené"}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {c.resolved ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}
                </button>
                <button
                  onClick={() => remove(c.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="mt-1 font-mono text-[10px] uppercase text-muted-foreground">
              {new Date(c.created_at).toLocaleString("cs-CZ")}
            </div>
          </div>
        ))}
        {visible.length === 0 && (
          <div className="rounded-sm border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
            Žádné {showResolved ? "" : "aktivní "}komentáře
          </div>
        )}
      </div>
      <div className="mt-2 space-y-1">
        <Textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Přidat komentář…"
        />
        <Button size="sm" className="w-full" onClick={submit} disabled={!body.trim()}>
          Odeslat
        </Button>
      </div>
    </div>
  );
}
