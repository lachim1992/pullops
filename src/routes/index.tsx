import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  Cable,
  ClipboardList,
  Route as RouteIcon,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/language-toggle";
import { useT } from "@/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PullOps — the operating system for structured cabling" },
      {
        name: "description",
        content:
          "Plan, execute and document structured cabling: registry, routes, reels, pulling and testing.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { t } = useT();

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* Ambient gold glow + fine grid */}
      <div className="glow-gold pointer-events-none absolute inset-0 -z-10" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-foreground) 1px, transparent 1px), linear-gradient(90deg, var(--color-foreground) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse 70% 55% at 50% 30%, black 40%, transparent 80%)",
        }}
      />

      <header className="relative">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-[color:var(--gold-soft)] to-[color:var(--accent)] text-primary-foreground shadow-[0_0_24px_-6px_var(--accent)]">
              <Cable className="h-4 w-4" />
            </div>
            <span className="font-display text-base font-semibold tracking-tight">
              PullOps
            </span>
          </div>
          <nav className="flex items-center gap-3">
            <LanguageToggle />
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/auth">{t("landing.ctaSignIn")}</Link>
            </Button>
            <Button asChild size="sm" className="rounded-full">
              <Link to="/auth" search={{ mode: "signup" }}>
                {t("landing.ctaSignUp")}
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="relative">
        {/* HERO */}
        <section className="mx-auto max-w-7xl px-6 pt-20 pb-24 md:pt-28 md:pb-32">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="max-w-4xl"
          >
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-3 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />
              {t("landing.kicker")}
            </div>

            <h1 className="font-display text-5xl font-semibold leading-[1.02] tracking-tight md:text-7xl">
              <span className="block text-foreground">{t("landing.heroTitle1")}</span>
              <span className="block text-gradient-gold">{t("landing.heroTitle2")}</span>
            </h1>

            <p className="mt-8 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
              {t("landing.heroSub")}
            </p>

            <div className="mt-10 flex flex-wrap gap-3">
              <Button asChild size="lg" className="group rounded-full px-6 shadow-[0_10px_40px_-16px_var(--accent)]">
                <Link to="/auth" search={{ mode: "signup" }}>
                  {t("landing.ctaStart")}
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full border-border/60 bg-card/40 px-6 backdrop-blur">
                <Link to="/auth">{t("landing.ctaHaveAccount")}</Link>
              </Button>
            </div>
          </motion.div>

          {/* Hero side product motif */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none absolute right-0 top-24 hidden h-[520px] w-[520px] -translate-y-10 translate-x-24 lg:block"
            aria-hidden
          >
            <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_center,var(--accent)_0%,transparent_60%)] opacity-30 blur-3xl" />
            <div className="absolute inset-10 rounded-full border border-[color:var(--accent)]/25" />
            <div className="absolute inset-20 rounded-full border border-[color:var(--accent)]/15" />
            <div className="absolute inset-32 rounded-full border border-[color:var(--accent)]/10" />
          </motion.div>
        </section>

        {/* FEATURES */}
        <section className="border-t border-border/60 bg-card/20 backdrop-blur">
          <div className="mx-auto max-w-7xl px-6 py-20">
            <motion.h2
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5 }}
              className="max-w-2xl font-display text-3xl font-semibold tracking-tight md:text-4xl"
            >
              {t("landing.featuresTitle")}
            </motion.h2>

            <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Feature index={0} icon={ClipboardList} title={t("landing.f1t")} body={t("landing.f1b")} />
              <Feature index={1} icon={Cable} title={t("landing.f2t")} body={t("landing.f2b")} />
              <Feature index={2} icon={RouteIcon} title={t("landing.f3t")} body={t("landing.f3b")} />
              <Feature index={3} icon={ShieldCheck} title={t("landing.f4t")} body={t("landing.f4b")} />
            </div>
          </div>
        </section>

        {/* STATUS */}
        <section className="mx-auto max-w-7xl px-6 py-20">
          <div className="card-noir rounded-2xl p-8 md:p-12">
            <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-accent">
              PullOps · v0.2
            </div>
            <h3 className="mt-3 font-display text-2xl font-semibold tracking-tight md:text-3xl">
              {t("landing.statusTitle")}
            </h3>
            <p className="mt-3 max-w-3xl text-muted-foreground">{t("landing.statusBody")}</p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-muted-foreground">
          <span>{t("landing.footer")}</span>
          <span className="font-mono tracking-widest">v0.2 · Noir & Gold</span>
        </div>
      </footer>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  body,
  index,
}: {
  icon: typeof Cable;
  title: string;
  body: string;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, delay: index * 0.06 }}
      className="group relative overflow-hidden rounded-xl border border-border/60 bg-card/60 p-6 backdrop-blur transition-colors hover:border-[color:var(--accent)]/40"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[color:var(--accent)]/60 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[color:var(--accent)]/30 bg-[color:var(--accent)]/10 text-accent">
        <Icon className="h-4 w-4" />
      </div>
      <h3 className="mt-4 font-display text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
    </motion.div>
  );
}
