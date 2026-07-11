import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { AppShell } from "@/components/app-shell";
import { listMyOrganizations } from "@/lib/orgs.functions";
import { listAuditEvents } from "@/lib/audit.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({
    meta: [{ title: "Audit · PullOps" }, { name: "robots", content: "noindex" }],
  }),
  component: AuditPage,
});

function AuditPage() {
  const listOrgs = useServerFn(listMyOrganizations);
  const listEvents = useServerFn(listAuditEvents);
  const orgs = useQuery({ queryKey: ["orgs"], queryFn: () => listOrgs() });
  const [orgId, setOrgId] = useState<string>("");

  const activeOrg = orgId || orgs.data?.[0]?.id;
  const events = useQuery({
    queryKey: ["audit", activeOrg],
    queryFn: () => listEvents({ data: { organizationId: activeOrg!, limit: 100 } }),
    enabled: !!activeOrg,
  });

  return (
    <AppShell>
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Viditelné pouze pro adminy dané organizace. Události jsou nepromazatelné.
          </p>
        </div>
        <div className="w-64">
          <Select value={activeOrg} onValueChange={setOrgId}>
            <SelectTrigger>
              <SelectValue placeholder="Vyberte organizaci" />
            </SelectTrigger>
            <SelectContent>
              {(orgs.data ?? []).map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {events.isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : !events.data || events.data.length === 0 ? (
        <div className="rounded-sm border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Žádné události nebo nemáte oprávnění admina.
        </div>
      ) : (
        <div className="rounded-sm border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Čas</TableHead>
                <TableHead>Entita</TableHead>
                <TableHead>Akce</TableHead>
                <TableHead className="font-mono text-[10px]">Entity ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.data.map((ev) => (
                <TableRow key={ev.id}>
                  <TableCell className="font-mono text-xs">
                    {new Date(ev.created_at).toLocaleString("cs-CZ")}
                  </TableCell>
                  <TableCell>{ev.entity_type}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {ev.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {ev.entity_id?.slice(0, 8) ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </AppShell>
  );
}
