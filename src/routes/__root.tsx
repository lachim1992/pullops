import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider, useT } from "@/i18n";


function NotFoundComponent() {
  const { t } = useT();
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4">
      <div className="glow-gold pointer-events-none absolute inset-0" />
      <div className="relative max-w-md text-center">
        <h1 className="font-display text-8xl font-bold tracking-tight text-gradient-gold">404</h1>
        <h2 className="mt-4 font-display text-xl font-semibold text-foreground">
          {t("errors.notFoundTitle")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("errors.notFoundBody")}</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02]"
          >
            {t("errors.backHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const { t } = useT();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
          {t("errors.pageTitle")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("errors.pageBody")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-transform hover:scale-[1.02]"
          >
            {t("errors.tryAgain")}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            {t("errors.home")}
          </a>
        </div>
      </div>
    </div>
  );
}


export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "PullOps — plánování strukturované kabeláže" },
      {
        name: "description",
        content:
          "Plánování, provedení a dokumentace strukturované kabeláže: kabelový registr, trasy, cívky, tah a testování.",
      },
      { property: "og:title", content: "PullOps — plánování strukturované kabeláže" },
      {
        property: "og:description",
        content: "Plánování, provedení a dokumentace strukturované kabeláže: kabelový registr, trasy, cívky, tah a testování.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "PullOps — plánování strukturované kabeláže" },
      { name: "twitter:description", content: "Plánování, provedení a dokumentace strukturované kabeláže: kabelový registr, trasy, cívky, tah a testování." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a8316b81-654f-4586-813c-8069b09dfd43/id-preview-b6d49e09--9274c261-c671-4dd9-ae48-fe60b127d7c6.lovable.app-1783845957656.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/a8316b81-654f-4586-813c-8069b09dfd43/id-preview-b6d49e09--9274c261-c671-4dd9-ae48-fe60b127d7c6.lovable.app-1783845957656.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],

  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="cs" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") {
        return;
      }
      router.invalidate();
      if (event !== "SIGNED_OUT") {
        queryClient.invalidateQueries();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <Outlet />
        <Toaster richColors position="top-right" theme="dark" />
      </QueryClientProvider>
    </I18nProvider>
  );
}

