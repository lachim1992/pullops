import type { ReactNode } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Cable,
  ClipboardList,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Route as RouteIcon,
  ScrollText,
  Settings,
  Wrench,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { getMyProfile } from "@/lib/orgs.functions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AppShell({ children, projectId }: { children: ReactNode; projectId?: string }) {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const profile = useQuery({
    queryKey: ["me"],
    queryFn: () => fetchProfile(),
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.invalidate();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex items-center gap-2 border-b border-sidebar-border px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-sidebar-primary text-sidebar-primary-foreground">
            <Cable className="h-4 w-4" />
          </div>
          <span className="font-mono text-sm font-semibold">PullOps</span>
        </div>

        <nav className="flex-1 overflow-y-auto p-2 text-sm">
          <NavGroup label="Přehled">
            <NavItem to="/dashboard" icon={LayoutDashboard}>
              Přehled
            </NavItem>
            <NavItem to="/audit" icon={ScrollText}>
              Audit
            </NavItem>
          </NavGroup>

          {projectId && (
            <NavGroup label="Projekt">
              <NavItem to="/projects/$projectId" params={{ projectId }} icon={FolderKanban}>
                Přehled projektu
              </NavItem>
              <NavItem
                to="/projects/$projectId/documents"
                params={{ projectId }}
                icon={ClipboardList}
              >
                Dokumenty
              </NavItem>
              <NavItem to="/projects/$projectId/plans" params={{ projectId }} icon={RouteIcon}>
                Plány
              </NavItem>
              <NavItem to="/projects/$projectId/endpoints" params={{ projectId }} icon={Wrench}>
                Endpointy
              </NavItem>
              <NavItem to="/projects/$projectId/cable-types" params={{ projectId }} icon={Cable}>
                Typy kabelů
              </NavItem>
              <NavItem
                to="/projects/$projectId/endpoint-kinds"
                params={{ projectId }}
                icon={Settings}
              >
                Typy endpointů
              </NavItem>
              <NavItem to="/projects/$projectId/patch-panels" params={{ projectId }} icon={Wrench}>
                Patch panely
              </NavItem>
              <NavItem to="/projects/$projectId/cables" params={{ projectId }} icon={Cable}>
                Kabelový registr
              </NavItem>
              <NavItem to="/projects/$projectId/spools" params={{ projectId }} icon={Cable}>
                Fyzické spulky
              </NavItem>
              <NavItem to="/projects/$projectId/work" params={{ projectId }} icon={Wrench}>
                Režim tahání
              </NavItem>


              <NavItem
                to="/projects/$projectId/members"
                params={{ projectId }}
                icon={ClipboardList}
              >
                Členové
              </NavItem>
              <NavItem to="/projects/$projectId/settings" params={{ projectId }} icon={Settings}>
                Nastavení
              </NavItem>
            </NavGroup>
          )}

          {!projectId && (
            <NavGroup label="Projekt">
              <div className="px-2 py-1 text-xs text-sidebar-foreground/50">
                Vyberte projekt na Přehledu
              </div>
            </NavGroup>
          )}
        </nav>

        <div className="border-t border-sidebar-border p-3 text-xs">
          <div className="mb-2 truncate text-sidebar-foreground/70">
            {profile.data?.full_name || profile.data?.email || "…"}
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={signOut}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Odhlásit
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}

function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1 px-2 font-mono text-[10px] uppercase tracking-widest text-sidebar-foreground/50">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

type NavItemProps = {
  to: string;
  params?: Record<string, string>;
  icon: typeof Cable;
  children: ReactNode;
};

function NavItem({ to, params, icon: Icon, children }: NavItemProps) {
  return (
    <Link
      to={to as never}
      params={params as never}
      className={cn(
        "flex items-center gap-2 rounded-sm px-2 py-1.5 text-sidebar-foreground/80 transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
      activeProps={{
        className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
      }}
      activeOptions={{ exact: to === "/dashboard" }}
    >
      <Icon className="h-4 w-4" />
      {children}
    </Link>
  );
}
