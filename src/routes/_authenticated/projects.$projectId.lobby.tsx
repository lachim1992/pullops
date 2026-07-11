import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare, ListChecks, Camera } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/projects/$projectId/lobby")({
  head: () => ({ meta: [{ title: "Lobby · PullOps" }, { name: "robots", content: "noindex" }] }),
  component: LobbyPage,
});

function LobbyPage() {
  const { projectId } = Route.useParams();
  return (
    <AppShell projectId={projectId}>
      <div className="animate-fade-in space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Projekt / Lobby
            </div>
            <h1 className="mt-1 font-mono text-2xl font-bold">Lobby</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Komunikace, úkoly a fotodokumentace projektu.
            </p>
          </div>
          <Badge variant="outline" className="font-mono text-xs">
            Připravuje se
          </Badge>
        </header>

        <div className="grid gap-4 md:grid-cols-3">
          <PlaceholderCard
            icon={<MessageSquare className="h-5 w-5" />}
            title="Chat projektu"
            description="Real-time konverzace všech členů projektu."
          />
          <PlaceholderCard
            icon={<ListChecks className="h-5 w-5" />}
            title="Úkoly & checkpointy"
            description="Zadávání úkolů s pod-checkpointy, přiřazení, deadline."
          />
          <PlaceholderCard
            icon={<Camera className="h-5 w-5" />}
            title="Fotogalerie"
            description="Fotky z místa, tagované ke kabelům a endpointům."
          />
        </div>
      </div>
    </AppShell>
  );
}

function PlaceholderCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card className="group border-dashed transition-all hover:border-primary/40 hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2 text-primary">
          {icon}
          <CardTitle className="font-mono text-sm">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}
