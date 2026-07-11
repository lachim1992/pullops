import { useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, UserMinus } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getProject } from "@/lib/projects.functions";
import { listOrgMembers } from "@/lib/orgs.functions";
import {
  addProjectMember,
  listProjectMembers,
  removeProjectMember,
  setProjectRole,
} from "@/lib/projects.functions";

const ROLES = [
  "project_manager",
  "site_lead",
  "puller",
  "rack_technician",
  "test_technician",
  "viewer",
] as const;

export const Route = createFileRoute("/_authenticated/projects/$projectId/members")({
  head: () => ({
    meta: [{ title: "Členové projektu · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: MembersPage,
});

function MembersPage() {
  const { projectId } = useParams({ from: "/_authenticated/projects/$projectId/members" });
  const fetchProject = useServerFn(getProject);
  const listMembersFn = useServerFn(listProjectMembers);
  const listOrgMembersFn = useServerFn(listOrgMembers);
  const addFn = useServerFn(addProjectMember);
  const removeFn = useServerFn(removeProjectMember);
  const setRoleFn = useServerFn(setProjectRole);
  const queryClient = useQueryClient();

  const project = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => fetchProject({ data: { id: projectId } }),
  });

  const members = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: () => listMembersFn({ data: { projectId } }),
  });

  const orgMembers = useQuery({
    queryKey: ["org-members", project.data?.organization_id],
    queryFn: () => listOrgMembersFn({ data: { organizationId: project.data!.organization_id } }),
    enabled: !!project.data?.organization_id,
  });

  const [selectedUser, setSelectedUser] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<(typeof ROLES)[number]>("puller");
  const [submitting, setSubmitting] = useState(false);

  async function handleAdd() {
    if (!selectedUser) return;
    setSubmitting(true);
    try {
      await addFn({
        data: { projectId, userId: selectedUser, role: selectedRole },
      });
      await queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
      toast.success("Člen přidán");
      setSelectedUser("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(userId: string) {
    if (!confirm("Odebrat člena z projektu?")) return;
    try {
      await removeFn({ data: { projectId, userId } });
      await queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
      toast.success("Odebráno");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  async function toggleRole(userId: string, role: string, has: boolean) {
    try {
      await setRoleFn({
        data: {
          projectId,
          userId,
          role: role as (typeof ROLES)[number],
          grant: !has,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["project-members", projectId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  const memberUserIds = new Set((members.data ?? []).map((m) => m.user_id));
  const availableOrgMembers = orgMembers.data?.filter((o) => !memberUserIds.has(o.user_id)) ?? [];

  return (
    <AppShell projectId={projectId}>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Členové projektu</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Přidejte členy z organizace a přiřaďte jim projektové role.
        </p>
      </header>

      <section className="mb-8 rounded-sm border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Přidat člena</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-64">
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger>
                <SelectValue placeholder="Vyberte člena organizace" />
              </SelectTrigger>
              <SelectContent>
                {availableOrgMembers.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    Žádní další členové organizace
                  </div>
                ) : (
                  availableOrgMembers.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.full_name || m.user_id.slice(0, 8)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="w-48">
            <Select
              value={selectedRole}
              onValueChange={(v) => setSelectedRole(v as typeof selectedRole)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAdd} disabled={!selectedUser || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Přidat
          </Button>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Aktuální členové</h2>
        {members.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <div className="rounded-sm border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Uživatel</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="w-32"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(members.data ?? []).map((m) => (
                  <TableRow key={m.user_id}>
                    <TableCell>{m.full_name || m.user_id.slice(0, 8)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {ROLES.map((r) => {
                          const has = m.roles.includes(r);
                          return (
                            <button
                              key={r}
                              onClick={() => toggleRole(m.user_id, r, has)}
                              className="text-xs"
                              type="button"
                            >
                              <Badge
                                variant={has ? "default" : "outline"}
                                className="font-mono text-[10px] cursor-pointer"
                              >
                                {r}
                              </Badge>
                            </button>
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => handleRemove(m.user_id)}>
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
