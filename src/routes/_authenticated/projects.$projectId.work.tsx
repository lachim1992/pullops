import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { AppShell } from "@/components/app-shell";
import { simulateSpools } from "@/lib/pullTasks.functions";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/projects/$projectId/work")({
  head: () => ({
    meta: [{ title: "Režim tahání · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: WorkModePage,
});

function WorkModePage() {
  const { projectId } = useParams({
    from: "/_authenticated/projects/$projectId/work",
  });
  const simulateFn = useServerFn(simulateSpools);
  const sim = useQuery({
    queryKey: ["work-sim", projectId],
    queryFn: () => simulateFn({ data: { projectId, defaultSpoolLengthM: 305 } }),
  });

  return (
    <AppShell projectId={projectId}>
      <div className="mb-6">
        <h1 className="font-mono text-2xl font-bold uppercase tracking-tight">Režim tahání</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Souhrn projektu, simulace spulek a odhad času tahání kabelů.
        </p>
      </div>

      {sim.isLoading && <div className="text-sm text-muted-foreground">Načítám…</div>}
      {sim.data && (
        <div className="space-y-6">
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Kabelů s délkou" value={String(sim.data.totalCables)} />
            <StatCard
              label="Bez délky"
              value={String(sim.data.missing)}
              tone={sim.data.missing > 0 ? "warn" : undefined}
            />
            <StatCard label="Celková délka" value={`${sim.data.totalMeters.toFixed(1)} m`} />
            <StatCard label="Spulka (výchozí)" value={`${sim.data.spoolLengthM} m`} />
          </section>

          <section>
            <h2 className="mb-2 font-mono text-sm font-semibold uppercase tracking-wider">
              Odhad času podle typu
            </h2>
            <div className="overflow-x-auto rounded-sm border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left font-mono text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2">Typ</th>
                    <th className="px-3 py-2 text-right">Metry</th>
                    <th className="px-3 py-2 text-right">Odhad (hod)</th>
                  </tr>
                </thead>
                <tbody>
                  {sim.data.hoursByType.map((r) => (
                    <tr key={r.typeCode} className="border-t border-border">
                      <td className="px-3 py-2 font-mono">{r.typeCode}</td>
                      <td className="px-3 py-2 text-right font-mono">{r.meters.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                        {r.hours == null ? "— (nastavit m/hod)" : r.hours.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                  {sim.data.hoursByType.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                        Žádná data
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-2 font-mono text-sm font-semibold uppercase tracking-wider">
              Simulace spulek
            </h2>
            <div className="space-y-2">
              {sim.data.spools.map((s, i) => {
                const wastedPct = s.capacity > 0 ? (s.wasted / s.capacity) * 100 : 0;
                return (
                  <div key={i} className="rounded-sm border border-border bg-card p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono">
                        {s.typeCode} · Spulka #{s.index}
                      </Badge>
                      <span className="font-mono text-xs">
                        {s.used.toFixed(1)} / {s.capacity} m
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        odpad {s.wasted.toFixed(1)} m ({wastedPct.toFixed(0)}%)
                      </span>
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
              {sim.data.spools.length === 0 && (
                <div className="rounded-sm border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  Žádné kabely s vypočtenou délkou. Vygenerujte trasy v editoru plánu.
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className="rounded-sm border border-border bg-card p-3">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={
          "mt-1 font-mono text-lg font-semibold " + (tone === "warn" ? "text-destructive" : "")
        }
      >
        {value}
      </div>
    </div>
  );
}
