import { createFileRoute, Link } from "@tanstack/react-router";
import { Cable, ClipboardList, Route as RouteIcon, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PullOps — plánování strukturované kabeláže" },
      {
        name: "description",
        content:
          "Plánování, provedení a dokumentace strukturované kabeláže: kabelový registr, trasy, cívky, tah a testování.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary text-primary-foreground">
              <Cable className="h-4 w-4" />
            </div>
            <span className="font-mono text-sm font-semibold tracking-tight">PullOps</span>
          </div>
          <nav className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Přihlásit se</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth" search={{ mode: "signup" }}>
                Vytvořit účet
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pt-20 pb-16">
          <div className="max-w-3xl">
            <div className="mb-4 inline-block rounded-sm border border-border bg-secondary px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Checkpoint&nbsp;A · Foundation
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">
              Jeden fyzický kabel.
              <br />
              Celý životní cyklus na jednom místě.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              PullOps řídí strukturovanou kabeláž na renovacích a nových stavbách McDonald's — od
              projektové dokumentace přes trasy a cívky až po tah v terénu, testování a předání.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Začít
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/auth">Mám účet</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="border-t border-border bg-card">
          <div className="mx-auto grid max-w-6xl gap-px overflow-hidden border-x border-border bg-border md:grid-cols-4">
            <Feature
              icon={ClipboardList}
              title="Projektová dokumentace"
              body="LAN plány, patch matice, revize. Zdroj pravdy pro celý tým."
            />
            <Feature
              icon={Cable}
              title="Kabelový registr"
              body="Human ID, systém, patch port, priorita. Deterministicky, bez tichých AI úprav."
            />
            <Feature
              icon={RouteIcon}
              title="Trasy a délky"
              body="Kalibrované plány, uzly, segmenty, konzervativní odhad délky."
            />
            <Feature
              icon={ShieldCheck}
              title="Bezpečnost a audit"
              body="Multi-tenant, RLS, atomické operace přes SECURITY DEFINER, audit log."
            />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-xl font-semibold">Kde jsme teď</h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Aktuální dodávka pokrývá základ: přihlášení, organizace, projekty, role a auditní
            vrstva. Dokumentace, plány s kalibrací, kabelový registr, cívky a Visual Pull Station
            přijdou v následujících checkpointech.
          </p>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 text-xs text-muted-foreground">
          <span>© PullOps</span>
          <span className="font-mono">v0.1 · Checkpoint A</span>
        </div>
      </footer>
    </div>
  );
}

function Feature({ icon: Icon, title, body }: { icon: typeof Cable; title: string; body: string }) {
  return (
    <div className="bg-card p-6">
      <Icon className="h-5 w-5 text-accent" />
      <h3 className="mt-3 text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}
