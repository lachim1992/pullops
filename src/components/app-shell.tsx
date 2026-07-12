import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowLeft,
  Cable,
  Camera,
  CheckSquare,
  ClipboardList,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Route as RouteIcon,
  ScrollText,
  Settings,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { NotificationsBell } from "@/components/notifications-bell";

import { supabase } from "@/integrations/supabase/client";
import { getMyProfile } from "@/lib/orgs.functions";
import { getMyCapabilities, getMyProjectCapabilities } from "@/lib/capabilities.functions";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/language-toggle";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";

export function AppShell({ children, projectId }: { children: ReactNode; projectId?: string }) {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useT();
  const [mobileOpen, setMobileOpen] = useState(false);
  const currentPath = useRouterState({ select: (s) => s.location.pathname });
  const canGoBack =
    currentPath !== "/dashboard" && currentPath !== "/" && currentPath !== "/auth";
  const fetchProfile = useServerFn(getMyProfile);
  const fetchCaps = useServerFn(getMyCapabilities);
  const fetchProjectCaps = useServerFn(getMyProjectCapabilities);

  const profile = useQuery({ queryKey: ["me"], queryFn: () => fetchProfile() });
  const caps = useQuery({ queryKey: ["me", "caps"], queryFn: () => fetchCaps() });
  const projectCaps = useQuery({
    queryKey: ["me", "project-caps", projectId ?? ""],
    queryFn: () => fetchProjectCaps({ data: { projectId: projectId! } }),
    enabled: !!projectId,
  });

  const canManage = projectCaps.data?.canManage ?? false;
  const isOrgAdmin = caps.data?.isOrgAdminAnywhere ?? false;

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.invalidate();
    navigate({ to: "/auth", replace: true });
  }

  const sidebar = (
    <SidebarBody
      projectId={projectId}
      canManage={canManage}
      isOrgAdmin={isOrgAdmin}
      profileName={profile.data?.full_name || profile.data?.email || "…"}
      onNavigate={() => setMobileOpen(false)}
      onSignOut={signOut}
      t={t}
    />
  );

  return (
    <div className="relative flex min-h-screen bg-background">
      <div className="glow-gold pointer-events-none absolute inset-0 -z-10 opacity-60" />

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        {sidebar}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <div className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-border/40 bg-background/70 px-3 backdrop-blur sm:px-4">
          {/* Mobile hamburger */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Menu"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-72 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground [&>button]:text-sidebar-foreground"
            >
              {sidebar}
            </SheetContent>
          </Sheet>

          <Link
            to="/dashboard"
            className="flex items-center gap-2 md:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-[color:var(--gold-soft)] to-[color:var(--accent)] text-primary-foreground">
              <Cable className="h-3.5 w-3.5" />
            </div>
            <span className="font-display text-sm font-semibold tracking-tight">PullOps</span>
          </Link>

          <div className="ml-auto flex items-center gap-2">
            <NotificationsBell />
          </div>
        </div>
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
      </main>
    </div>
  );
}

function SidebarBody({
  projectId,
  canManage,
  isOrgAdmin,
  profileName,
  onNavigate,
  onSignOut,
  t,
}: {
  projectId?: string;
  canManage: boolean;
  isOrgAdmin: boolean;
  profileName: string;
  onNavigate: () => void;
  onSignOut: () => void;
  t: (k: string) => string;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-gradient-to-br from-[color:var(--gold-soft)] to-[color:var(--accent)] text-primary-foreground shadow-[0_0_18px_-6px_var(--accent)]">
          <Cable className="h-4 w-4" />
        </div>
        <span className="font-display text-base font-semibold tracking-tight">PullOps</span>
      </div>

      <nav className="flex-1 overflow-y-auto p-2 text-sm">
        <NavGroup label={t("nav.overview")}>
          <NavItem to="/dashboard" icon={LayoutDashboard} onClick={onNavigate}>
            {t("nav.projects")}
          </NavItem>
          <NavItem to="/org-chat" icon={MessageSquare} onClick={onNavigate}>
            Firemní chat
          </NavItem>
          {isOrgAdmin && (
            <NavItem to="/audit" icon={ScrollText} onClick={onNavigate}>
              {t("nav.audit")}
            </NavItem>
          )}
        </NavGroup>

        {projectId && (
          <div className="mb-4">
            <div className="mb-1 px-2 font-mono text-[10px] uppercase tracking-[0.24em] text-sidebar-foreground/50">
              {t("nav.project")}
            </div>
            <NavItem to="/projects/$projectId" params={{ projectId }} icon={FolderKanban} onClick={onNavigate}>
              {t("nav.projectOverview")}
            </NavItem>

            <Accordion
              type="multiple"
              defaultValue={canManage ? ["manage", "lobby", "pull", "completion"] : ["lobby", "pull", "completion"]}
              className="mt-2"
            >
              {canManage && (
                <BranchItem value="manage" label={t("nav.manage")} icon={<ShieldCheck className="h-3.5 w-3.5" />}>
                  <NavItem to="/projects/$projectId/documents" params={{ projectId }} icon={ClipboardList} onClick={onNavigate}>
                    {t("nav.documents")}
                  </NavItem>
                  <NavItem to="/projects/$projectId/plans" params={{ projectId }} icon={RouteIcon} onClick={onNavigate}>
                    {t("nav.plans")}
                  </NavItem>
                  <NavItem to="/projects/$projectId/endpoints" params={{ projectId }} icon={Wrench} onClick={onNavigate}>
                    {t("nav.endpoints")}
                  </NavItem>
                  <NavItem to="/projects/$projectId/cable-types" params={{ projectId }} icon={Cable} onClick={onNavigate}>
                    {t("nav.cableTypes")}
                  </NavItem>
                  <NavItem to="/projects/$projectId/endpoint-kinds" params={{ projectId }} icon={Settings} onClick={onNavigate}>
                    {t("nav.endpointKinds")}
                  </NavItem>
                  <NavItem to="/projects/$projectId/patch-panels" params={{ projectId }} icon={Wrench} onClick={onNavigate}>
                    {t("nav.patchPanels")}
                  </NavItem>
                  <NavItem to="/projects/$projectId/cables" params={{ projectId }} icon={Cable} onClick={onNavigate}>
                    {t("nav.cables")}
                  </NavItem>
                  <NavItem to="/projects/$projectId/spools" params={{ projectId }} icon={Cable} onClick={onNavigate}>
                    {t("nav.spools")}
                  </NavItem>
                  <NavItem to="/projects/$projectId/members" params={{ projectId }} icon={ClipboardList} onClick={onNavigate}>
                    {t("nav.members")}
                  </NavItem>
                  <NavItem to="/projects/$projectId/settings" params={{ projectId }} icon={Settings} onClick={onNavigate}>
                    {t("nav.settings")}
                  </NavItem>
                </BranchItem>
              )}

              <BranchItem value="lobby" label={t("nav.lobby")} icon={<Camera className="h-3.5 w-3.5" />}>
                <NavItem to="/projects/$projectId/lobby" params={{ projectId }} icon={ClipboardList} onClick={onNavigate}>
                  {t("nav.lobbyDesc")}
                </NavItem>
              </BranchItem>

              <BranchItem value="pull" label={t("nav.pullMode")} icon={<Cable className="h-3.5 w-3.5" />}>
                <NavItem to="/projects/$projectId/work" params={{ projectId }} icon={Wrench} onClick={onNavigate}>
                  {t("nav.pulling")}
                </NavItem>
                <NavItem to="/projects/$projectId/defects" params={{ projectId }} icon={AlertTriangle} onClick={onNavigate}>
                  {t("nav.defects")}
                </NavItem>
              </BranchItem>

              <BranchItem value="completion" label={t("nav.completionMode")} icon={<CheckSquare className="h-3.5 w-3.5" />}>
                <NavItem to="/projects/$projectId/completion" params={{ projectId }} icon={CheckSquare} onClick={onNavigate}>
                  {t("nav.completion")}
                </NavItem>
              </BranchItem>
            </Accordion>
          </div>
        )}

        {!projectId && (
          <NavGroup label={t("nav.project")}>
            <div className="px-2 py-1 text-xs text-sidebar-foreground/50">{t("nav.pickProject")}</div>
          </NavGroup>
        )}
      </nav>

      <div className="border-t border-sidebar-border p-3 text-xs">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1 truncate text-sidebar-foreground/70">{profileName}</div>
          <LanguageToggle compact />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          onClick={onSignOut}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {t("common.signOut")}
        </Button>
      </div>
    </div>
  );
}

function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-1 px-2 font-mono text-[10px] uppercase tracking-[0.24em] text-sidebar-foreground/50">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function BranchItem({
  value,
  label,
  icon,
  children,
}: {
  value: string;
  label: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <AccordionItem value={value} className="border-b-0">
      <AccordionTrigger
        className={cn(
          "rounded-md px-2 py-1.5 font-mono text-[11px] uppercase tracking-[0.22em] text-sidebar-foreground/60",
          "hover:bg-sidebar-accent/40 hover:text-sidebar-foreground hover:no-underline",
          "[&[data-state=open]]:text-sidebar-foreground",
        )}
      >
        <span className="flex items-center gap-2">
          {icon}
          {label}
        </span>
      </AccordionTrigger>
      <AccordionContent className="pb-1 pt-1">
        <div className="ml-1 space-y-0.5 border-l border-sidebar-border/50 pl-2">{children}</div>
      </AccordionContent>
    </AccordionItem>
  );
}

type NavItemProps = {
  to: string;
  params?: Record<string, string>;
  icon: typeof Cable;
  children: ReactNode;
  onClick?: () => void;
};

function NavItem({ to, params, icon: Icon, children, onClick }: NavItemProps) {
  return (
    <Link
      to={to as never}
      params={params as never}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-md px-2 py-1.5 text-sidebar-foreground/80 transition-all duration-150",
        "hover:translate-x-0.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
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
