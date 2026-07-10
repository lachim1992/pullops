import { useState } from "react";
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, UserMinus } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  addOrgMemberByEmail,
  listMyOrganizations,
  listOrgMembers,
  removeOrgMember,
  setOrgRole,
  updateOrganization,
} from "@/lib/orgs.functions";

const ORG_ROLES = ["admin", "project_manager", "viewer"] as const;

export const Route = createFileRoute("/_authenticated/organizations/$orgId/settings")({
  head: () => ({
    meta: [{ title: "Nastavení organizace · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: OrgSettingsPage,
});

function OrgSettingsPage() {
  const { orgId } = useParams({ from: "/_authenticated/organizations/$orgId/settings" });
  const queryClient = useQueryClient();
  const listOrgs = useServerFn(listMyOrganizations);
  const updateFn = useServerFn(updateOrganization);
  const listMembersFn = useServerFn(listOrgMembers);
  const addByEmailFn = useServerFn(addOrgMemberByEmail);
  const removeFn = useServerFn(removeOrgMember);
  const setRoleFn = useServerFn(setOrgRole);

  const orgs = useQuery({ queryKey: ["orgs"], queryFn: () => listOrgs() });
  const members = useQuery({
    queryKey: ["org-members", orgId],
    queryFn: () => listMembersFn({ data: { organizationId: orgId } }),
  });

  const org = orgs.data?.find((o) => o.id === orgId);
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // sync
  if (org && name === "" && org.name) setName(org.name);

  async function saveName() {
    setSubmitting(true);
    try {
      await updateFn({ data: { id: orgId, name } });
      await queryClient.invalidateQueries({ queryKey: ["orgs"] });
      toast.success("Uloženo");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    } finally {
      setSubmitting(false);
    }
  }

  async function addMember() {
    setSubmitting(true);
    try {
      await addByEmailFn({ data: { organizationId: orgId, email } });
      await queryClient.invalidateQueries({ queryKey: ["org-members", orgId] });
      toast.success("Člen přidán");
      setEmail("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    } finally {
      setSubmitting(false);
    }
  }

  async function removeMember(userId: string) {
    if (!confirm("Odebrat člena z organizace?")) return;
    try {
      await removeFn({ data: { organizationId: orgId, userId } });
      await queryClient.invalidateQueries({ queryKey: ["org-members", orgId] });
      toast.success("Odebráno");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  async function toggleRole(userId: string, role: string, has: boolean) {
    try {
      await setRoleFn({
        data: {
          organizationId: orgId,
          userId,
          role: role as (typeof ORG_ROLES)[number],
          grant: !has,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["org-members", orgId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Chyba");
    }
  }

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Nastavení organizace</h1>
      </header>

      <section className="mb-8 max-w-xl rounded-sm border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Základní údaje</h2>
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="orgName">Název organizace</Label>
            <Input
              id="orgName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
            />
          </div>
          <Button onClick={saveName} disabled={submitting || !name}>
            Uložit
          </Button>
        </div>
      </section>

      <section className="mb-8 rounded-sm border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Přidat člena podle emailu</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Uživatel musí mít existující účet v PullOps. E-mailové pozvánky pro
          nové uživatele přijdou v Checkpointu B.
        </p>
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button onClick={addMember} disabled={submitting || !email}>
            Přidat
          </Button>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Členové</h2>
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
                        {ORG_ROLES.map((r) => {
                          const has = m.roles.includes(r);
                          return (
                            <button
                              key={r}
                              type="button"
                              onClick={() => toggleRole(m.user_id, r, has)}
                            >
                              <Badge
                                variant={has ? "default" : "outline"}
                                className="cursor-pointer font-mono text-[10px]"
                              >
                                {r}
                              </Badge>
                            </button>
                          );
                        })}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeMember(m.user_id)}
                      >
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
