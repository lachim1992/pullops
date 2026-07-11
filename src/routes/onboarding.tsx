import { useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Cable, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { createOrganization, listMyOrganizations } from "@/lib/orgs.functions";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Nová organizace · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const createOrg = useServerFn(createOrganization);
  const listOrgs = useServerFn(listMyOrganizations);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createOrg({ data: { name } });
      const orgs = await listOrgs();
      toast.success(`Organizace „${name}" vytvořena.`);
      navigate({ to: "/dashboard", search: { org: orgs[0]?.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nepodařilo se vytvořit organizaci");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary text-primary-foreground">
            <Cable className="h-4 w-4" />
          </div>
          <span className="font-mono text-sm font-semibold">PullOps</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Vytvořte první organizaci</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Stanete se administrátorem této organizace. Můžete přizvat další členy a spravovat
          projekty.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="name">Název organizace</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              placeholder="Např. Instalatér s.r.o."
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Vytvořit organizaci
          </Button>
        </form>
      </div>
    </div>
  );
}
