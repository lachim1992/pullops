import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, XCircle, FlaskConical, Scissors } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/projects/$projectId/completion")({
  head: () => ({
    meta: [{ title: "Kompletace · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: CompletionPage,
});

function CompletionPage() {
  const { projectId } = Route.useParams();
  return (
    <AppShell projectId={projectId}>
      <div className="animate-fade-in space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Projekt / Režim kompletace
            </div>
            <h1 className="mt-1 font-mono text-2xl font-bold">Režim kompletace</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Zakončování, testování a uzavírání kabelů po natažení.
            </p>
          </div>
          <Badge variant="outline" className="font-mono text-xs">
            Připravuje se
          </Badge>
        </header>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StateCard
            icon={<Scissors className="h-5 w-5" />}
            title="TERMINATED"
            description="Kabel zakončen (konektorováno / patchováno)."
          />
          <StateCard
            icon={<FlaskConical className="h-5 w-5" />}
            title="TESTED"
            description="Ověřeno měřením / testem."
          />
          <StateCard
            icon={<CheckCircle2 className="h-5 w-5" />}
            title="DONE"
            description="Uzavřeno, předáno do provozu."
          />
          <StateCard
            icon={<XCircle className="h-5 w-5" />}
            title="CANCELLED"
            description="Zrušeno / nebude dokončeno."
          />
        </div>
      </div>
    </AppShell>
  );
}

function StateCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card className="border-dashed transition-all hover:border-primary/40 hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 text-primary">
          {icon}
          <CardTitle className="font-mono text-xs tracking-widest">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
