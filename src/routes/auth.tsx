import { useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { z } from "zod";
import { toast } from "sonner";
import { Cable, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LanguageToggle } from "@/components/language-toggle";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useT } from "@/i18n";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
  next: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Sign in · PullOps" },
      { name: "description", content: "Sign in or create an account in PullOps." },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async ({ search }) => {
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
  const { t } = useT();
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
        toast.success(t("auth.createdOk"));
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: search.next ?? "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.signInFailed"));
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
        toast.error(result.error.message ?? t("auth.googleFailed"));
        return;
      }
      if (result.redirected) return;
      navigate({ to: search.next ?? "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.googleFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div className="glow-gold pointer-events-none absolute inset-0 -z-10" />
      <div className="absolute right-6 top-6">
        <LanguageToggle />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm rounded-2xl border border-border/60 bg-card/70 p-8 backdrop-blur"
      >
        <div className="mb-8 flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-[color:var(--gold-soft)] to-[color:var(--accent)] text-primary-foreground shadow-[0_0_18px_-6px_var(--accent)]">
            <Cable className="h-4 w-4" />
          </div>
          <span className="font-display text-base font-semibold">PullOps</span>
        </div>

        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {mode === "signup" ? t("auth.signUpTitle") : t("auth.signInTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signup" ? t("auth.signUpSub") : t("auth.signInSub")}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          {mode === "signup" && (
            <div className="space-y-1.5">
              <Label htmlFor="fullName">{t("auth.fullName")}</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">{t("auth.password")}</Label>
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
          <Button type="submit" className="w-full rounded-full" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {mode === "signup" ? t("auth.signUpTitle") : t("auth.signInTitle")}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          <div className="h-px flex-1 bg-border" />
          {t("auth.or")}
          <div className="h-px flex-1 bg-border" />
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full rounded-full border-border/60 bg-card/40"
          onClick={handleGoogle}
          disabled={submitting}
        >
          {t("auth.google")}
        </Button>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signup" ? (
            <>
              {t("auth.haveAccount")}{" "}
              <button
                type="button"
                className="font-medium text-accent underline-offset-4 hover:underline"
                onClick={() => setMode("signin")}
              >
                {t("auth.signInTitle")}
              </button>
            </>
          ) : (
            <>
              {t("auth.noAccount")}{" "}
              <button
                type="button"
                className="font-medium text-accent underline-offset-4 hover:underline"
                onClick={() => setMode("signup")}
              >
                {t("auth.signUpTitle")}
              </button>
            </>
          )}
        </p>
      </motion.div>
    </div>
  );
}
