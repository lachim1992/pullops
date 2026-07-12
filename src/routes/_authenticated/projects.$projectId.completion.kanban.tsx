import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, XCircle, FlaskConical, Scissors, Cable as CableIcon, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listCompletionTasks, setCompletionStatus, type CompletionStatus } from "@/lib/completion.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/projects/$projectId/completion/kanban")({
  component: KanbanPage,
});

const COLUMNS: Array<{
  key: CompletionStatus;
  label: string;
  icon: React.ReactNode;
  tone: string;
  next: CompletionStatus[];
}> = [
  { key: "PULLED", label: "Nataženo", icon: <CableIcon className="h-4 w-4" />, tone: "bg-muted", next: ["TERMINATED", "CANCELLED"] },
  { key: "TERMINATED", label: "Zakončeno", icon: <Scissors className="h-4 w-4" />, tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400", next: ["TESTED", "CANCELLED"] },
  { key: "TESTED", label: "Otestováno", icon: <FlaskConical className="h-4 w-4" />, tone: "bg-blue-500/10 text-blue-700 dark:text-blue-400", next: ["DONE", "CANCELLED"] },
  { key: "DONE", label: "Hotovo", icon: <CheckCircle2 className="h-4 w-4" />, tone: "bg-green-500/10 text-green-700 dark:text-green-400", next: [] },
  { key: "CANCELLED", label: "Zrušeno", icon: <XCircle className="h-4 w-4" />, tone: "bg-red-500/10 text-red-700 dark:text-red-400", next: [] },
];

function KanbanPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const fetchFn = useServerFn(listCompletionTasks);
  const setStatusFn = useServerFn(setCompletionStatus);

  const q = useQuery({
    queryKey: ["completion", projectId],
    queryFn: () => fetchFn({ data: { projectId } }),
  });

  const [cancelFor, setCancelFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  async function move(taskId: string, status: CompletionStatus) {
    if (status === "CANCELLED") { setCancelFor(taskId); return; }
    try {
      await setStatusFn({ data: { taskId, status } });
      qc.invalidateQueries({ queryKey: ["completion", projectId] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Chyba"); }
  }

  async function confirmCancel() {
    if (!cancelFor) return;
    try {
      await setStatusFn({ data: { taskId: cancelFor, status: "CANCELLED", cancelledReason: reason || null } });
      qc.invalidateQueries({ queryKey: ["completion", projectId] });
      setCancelFor(null); setReason("");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Chyba"); }
  }

  return (
    <AppShell projectId={projectId}>
      <div className="animate-fade-in space-y-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Projekt / Kompletace / Kanban kabelů
            </div>
            <h1 className="mt-1 font-mono text-2xl font-bold">Kanban kabelů</h1>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/projects/$projectId/completion" params={{ projectId }}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Zpět
            </Link>
          </Button>
        </header>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {COLUMNS.map((col) => {
            const items = (q.data ?? []).filter((t) => t.status === col.key);
            return (
              <div key={col.key} className="space-y-2">
                <div className={cn("flex items-center gap-2 rounded-sm px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest", col.tone)}>
                  {col.icon}
                  {col.label} · {items.length}
                </div>
                <div className="space-y-2">
                  {items.length === 0 && (
                    <div className="rounded-md border border-dashed p-4 text-center font-mono text-[10px] text-muted-foreground">
                      Prázdné
                    </div>
                  )}
                  {items.map((t) => (
                    <Card key={t.id} className="animate-fade-in border-border/60">
                      <CardContent className="space-y-2 p-3">
                        <div className="font-mono text-xs font-semibold">{t.cableCode}</div>
                        {col.next.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {col.next.map((n) => (
                              <Button key={n} size="sm" variant="outline" className="h-6 px-2 font-mono text-[10px]" onClick={() => move(t.id, n)}>
                                → {COLUMNS.find((c) => c.key === n)?.label}
                              </Button>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <Dialog open={cancelFor !== null} onOpenChange={(o) => !o && setCancelFor(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Zrušit kabel</DialogTitle></DialogHeader>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Důvod" />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCancelFor(null)}>Zpět</Button>
              <Button variant="destructive" onClick={confirmCancel}>Zrušit</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
