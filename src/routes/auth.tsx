import { useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { toast } from "sonner";
import { Cable, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
  next: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Přihlášení · PullOps" },
      { name: "description", content: "Přihlásit se nebo vytvořit účet v PullOps." },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async ({ search }) => {
    // If already signed in, bounce off the auth route.
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      throw redirect({ to: search.next ?? "/dashboard" });
    }
  },
  component: AuthPage,
});

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">(search.mode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("Účet vytvořen. Můžete pokračovat.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: search.next ?? "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Přihlášení selhalo");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setSubmitting(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        toast.error(result.error.message ?? "Google přihlášení selhalo");
        return;
      }
      if (result.redirected) return;
      navigate({ to: search.next ?? "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google přihlášení selhalo");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-primary text-primary-foreground">
            <Cable className="h-4 w-4" />
          </div>
          <span className="font-mono text-sm font-semibold">PullOps</span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">
          {mode === "signup" ? "Vytvořit účet" : "Přihlásit se"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signup"
            ? "Založte si účet a poté vytvoříte první organizaci."
            : "Zadejte email a heslo, nebo pokračujte přes Google."}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Jméno a příjmení</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Heslo</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "signup" ? "Vytvořit účet" : "Přihlásit se"}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs uppercase tracking-widest text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          nebo
          <div className="h-px flex-1 bg-border" />
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleGoogle}
          disabled={submitting}
        >
          Pokračovat s Google
        </Button>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signup" ? (
            <>
              Máte účet?{" "}
              <button
                type="button"
                className="font-medium text-foreground underline underline-offset-4"
                onClick={() => setMode("signin")}
              >
                Přihlásit se
              </button>
            </>
          ) : (
            <>
              Nemáte účet?{" "}
              <button
                type="button"
                className="font-medium text-foreground underline underline-offset-4"
                onClick={() => setMode("signup")}
              >
                Vytvořit účet
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
