import { useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Info } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ICON_CHOICES,
  resolveKindColor,
  resolveKindIcon,
  useEndpointKindMutations,
  useEndpointKinds,
} from "@/hooks/useEndpointKinds";

export const Route = createFileRoute(
  "/_authenticated/projects/$projectId/endpoint-kinds",
)({
  head: () => ({
    meta: [
      { title: "Typy endpointů · PullOps" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EndpointKindsPage,
});

function EndpointKindsPage() {
  const { projectId } = useParams({
    from: "/_authenticated/projects/$projectId/endpoint-kinds",
  });
  const kinds = useEndpointKinds(projectId);
  const { update, remove } = useEndpointKindMutations(projectId);

  async function onReserveChange(id: string, value: string) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return;
    try {
      await update.mutateAsync({ id, defaultReserveM: n });
      toast.success("Rezerva uložena");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  async function onLabelChange(id: string, value: string) {
    if (!value.trim()) return;
    try {
      await update.mutateAsync({ id, label: value.trim() });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  async function onDelete(id: string, label: string) {
    if (!confirm(`Smazat typ "${label}"?`)) return;
    try {
      await remove.mutateAsync(id);
      toast.success("Typ smazán");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  return (
    <AppShell projectId={projectId}>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Typy endpointů</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Rezerva u každého typu představuje metry navíc připočtené na tuto
            stranu kabelu (vertikální trasy, přebytek na zapojení). Součet obou
            stran kabelu se přičítá k naměřené trase v plánu.
          </p>
        </div>
        <NewKindDialog projectId={projectId} />
      </header>

      <div className="mb-4 flex items-start gap-2 rounded-sm border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div>
          Rezerva z endpointu <strong>přebíjí</strong> rezervu z typu kabelu.
          Pokud u endpointu není typ nastaven, použije se rezerva typu kabelu.
        </div>
      </div>

      {kinds.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Načítám…
        </div>
      ) : !kinds.data || kinds.data.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Zatím žádné typy.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left font-mono text-xs uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="p-2 w-10"></th>
                <th className="p-2">Kód</th>
                <th className="p-2">Název</th>
                <th className="p-2 w-32">Rezerva [m]</th>
                <th className="p-2 w-24">Systém</th>
                <th className="p-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {kinds.data.map((k) => {
                const Icon = resolveKindIcon(k.icon, k.code);
                const color = resolveKindColor(k.color, k.code);
                return (
                  <tr key={k.id} className="border-t border-border">
                    <td className="p-2">
                      <span
                        className="inline-flex h-6 w-6 items-center justify-center rounded-sm"
                        style={{ backgroundColor: color, color: "white" }}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                    </td>
                    <td className="p-2 font-mono text-xs">{k.code}</td>
                    <td className="p-2">
                      <Input
                        defaultValue={k.label}
                        onBlur={(e) => {
                          if (e.target.value !== k.label) onLabelChange(k.id, e.target.value);
                        }}
                        className="h-8"
                      />
                    </td>
                    <td className="p-2">
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        defaultValue={k.default_reserve_m}
                        onBlur={(e) => {
                          if (Number(e.target.value) !== Number(k.default_reserve_m))
                            onReserveChange(k.id, e.target.value);
                        }}
                        className="h-8 text-right font-mono"
                      />
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {k.is_system ? "ano" : "—"}
                    </td>
                    <td className="p-2 text-right">
                      {!k.is_system && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onDelete(k.id, k.label)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}

function NewKindDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [reserve, setReserve] = useState("3");
  const [icon, setIcon] = useState<string>("HelpCircle");
  const [color, setColor] = useState<string>("hsl(0 0% 40%)");
  const { create } = useEndpointKindMutations(projectId);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    if (!normalized || !label.trim()) return;
    try {
      await create.mutateAsync({
        projectId,
        code: normalized,
        label: label.trim(),
        defaultReserveM: Number(reserve),
        icon,
        color,
      });
      toast.success("Typ přidán");
      setOpen(false);
      setCode("");
      setLabel("");
      setReserve("3");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" /> Nový typ
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nový typ endpointu</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>Kód (interní)</Label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="např. CUSTOM_TERMINAL"
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Automaticky velká písmena, číslice a podtržítka.
            </p>
          </div>
          <div>
            <Label>Název v UI</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="např. Vlastní terminál"
              required
            />
          </div>
          <div>
            <Label>Výchozí rezerva [m]</Label>
            <Input
              type="number"
              step="0.1"
              min="0"
              value={reserve}
              onChange={(e) => setReserve(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ikona</Label>
              <Select value={icon} onValueChange={setIcon}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ICON_CHOICES.map((i) => (
                    <SelectItem key={i} value={i}>
                      {i}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Barva (HSL / hex)</Label>
              <Input value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Zrušit
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Ukládám…" : "Přidat"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
