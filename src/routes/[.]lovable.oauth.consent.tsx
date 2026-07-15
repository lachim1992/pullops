import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";

import { supabase } from "@/integrations/supabase/client";

type OAuthNamespace = {
  getAuthorizationDetails: (
    id: string,
  ) => Promise<{
    data: {
      client?: { name?: string; client_id?: string } | null;
      scope?: string | null;
      redirect_uri?: string | null;
      redirect_url?: string | null;
      redirect_to?: string | null;
    } | null;
    error: { message: string } | null;
  }>;
  approveAuthorization: (id: string) => Promise<{
    data: { redirect_url?: string | null; redirect_to?: string | null } | null;
    error: { message: string } | null;
  }>;
  denyAuthorization: (id: string) => Promise<{
    data: { redirect_url?: string | null; redirect_to?: string | null } | null;
    error: { message: string } | null;
  }>;
};

function getOAuth(): OAuthNamespace {
  const client = supabase as unknown as { auth: { oauth?: OAuthNamespace } };
  if (!client.auth.oauth) {
    throw new Error("Supabase OAuth API není dostupné v tomto SDK.");
  }
  return client.auth.oauth;
}

function isSafeRelativePath(v: string | null): v is string {
  return !!v && v.startsWith("/") && !v.startsWith("//");
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Chybí authorization_id.");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = location.pathname + location.searchStr;
      throw redirect({ to: "/auth", search: { next } });
    }
  },
  loader: async ({ location }) => {
    const params = new URLSearchParams(location.search);
    const authorizationId = params.get("authorization_id")!;
    const { data, error } = await getOAuth().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to ?? null;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 text-center">
      <div className="max-w-md">
        <h1 className="font-display text-xl font-semibold">Chyba autorizace</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {String((error as Error)?.message ?? error)}
        </p>
      </div>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientName = details?.client?.name ?? "externí aplikace";
  const scope = details?.scope ?? "";
  const scopes = scope.split(/\s+/).filter(Boolean);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const oauth = getOAuth();
    const { data, error: err } = approve
      ? await oauth.approveAuthorization(authorization_id)
      : await oauth.denyAuthorization(authorization_id);
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("Autorizační server nevrátil adresu přesměrování.");
      return;
    }
    if (isSafeRelativePath(target)) {
      window.location.assign(target);
    } else {
      window.location.href = target;
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/70 p-8 backdrop-blur">
        <h1 className="font-display text-xl font-semibold tracking-tight">
          Propojit {clientName} s PullOps
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {clientName} bude moct volat nástroje PullOps vaším jménem. Přístup k datům se řídí
          vaším členstvím v projektech a rolí — nic navíc.
        </p>

        {scopes.length > 0 && (
          <div className="mt-4 space-y-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              Požadovaná oprávnění
            </p>
            <ul className="text-sm">
              {scopes.map((s: string) => (
                <li key={s} className="text-foreground">
                  • {s}
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-500">
            {error}
          </p>
        )}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(true)}
            className="flex-1 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02] disabled:opacity-60"
          >
            Povolit přístup
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide(false)}
            className="flex-1 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
          >
            Odmítnout
          </button>
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Toto nepřepisuje oprávnění v PullOps ani zabezpečovací pravidla databáze.
        </p>
      </div>
    </main>
  );
}
