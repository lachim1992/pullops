import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dbErrorMessage } from "@/lib/dbErrors";

const uuid = z.string().uuid();

export type ProjectProgress = {
  cables: {
    total: number;
    pulled: number;
    terminated: number;
    tested: number;
    done: number;
  };
  endpoints: { total: number };
  defects: { open: number; resolved: number; total: number };
  progressPct: number;
  pulledPct: number;
  terminatedPct: number;
  testedPct: number;
};

export const getProjectProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: uuid }).parse(d))
  .handler(async ({ data, context }): Promise<ProjectProgress> => {
    const { supabase } = context;
    const { data: cables, error: cErr } = await supabase
      .from("cables")
      .select("status")
      .eq("project_id", data.projectId);
    if (cErr) throw new Error(dbErrorMessage(cErr));

    const total = cables?.length ?? 0;
    // cable_status: PLANNED, PULLED, TERMINATED, TESTED, DONE, CANCELLED
    // phases are cumulative — a TERMINATED cable is also pulled, etc.
    const PULLED_SET = new Set(["PULLED", "TERMINATED", "TESTED", "DONE"]);
    const TERM_SET = new Set(["TERMINATED", "TESTED", "DONE"]);
    const TEST_SET = new Set(["TESTED", "DONE"]);
    let pulled = 0,
      terminated = 0,
      tested = 0,
      done = 0;
    for (const c of cables ?? []) {
      const s = c.status as string;
      if (PULLED_SET.has(s)) pulled++;
      if (TERM_SET.has(s)) terminated++;
      if (TEST_SET.has(s)) tested++;
      if (s === "DONE") done++;
    }

    const { count: epCount, error: eErr } = await supabase
      .from("endpoints")
      .select("id", { count: "exact", head: true })
      .eq("project_id", data.projectId);
    if (eErr) throw new Error(dbErrorMessage(eErr));

    const { data: defRows, error: dErr } = await supabase
      .from("defects")
      .select("status")
      .eq("project_id", data.projectId);
    if (dErr) throw new Error(dbErrorMessage(dErr));
    const defTotal = defRows?.length ?? 0;
    const defResolved = (defRows ?? []).filter((d) => d.status === "RESOLVED").length;
    const defOpen = defTotal - defResolved;

    const denom = total * 3;
    const progressPct = denom > 0 ? Math.round(((pulled + terminated + tested) / denom) * 100) : 0;

    return {
      cables: { total, pulled, terminated, tested, done },
      endpoints: { total: epCount ?? 0 },
      defects: { open: defOpen, resolved: defResolved, total: defTotal },
      progressPct,
      pulledPct: total > 0 ? Math.round((pulled / total) * 100) : 0,
      terminatedPct: total > 0 ? Math.round((terminated / total) * 100) : 0,
      testedPct: total > 0 ? Math.round((tested / total) * 100) : 0,
    };
  });

export const getMyDashboardSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ organizationId: uuid.optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Projects the user is member of (optionally within an org)
    let pq = supabase.from("projects").select("id, name, code, status, is_demo, organization_id");
    if (data.organizationId) pq = pq.eq("organization_id", data.organizationId);
    const { data: projects, error: pErr } = await pq;
    if (pErr) throw new Error(dbErrorMessage(pErr));

    const projectIds = (projects ?? []).map((p) => p.id);

    // Aggregate cables/defects per project in bulk
    const cablesByProject = new Map<string, string[]>();
    const defectsByProject = new Map<string, number>();
    let myOpenDefects = 0;
    let myOpenTasks = 0;

    if (projectIds.length > 0) {
      const { data: cRows } = await supabase
        .from("cables")
        .select("project_id, status")
        .in("project_id", projectIds);
      for (const r of cRows ?? []) {
        const arr = cablesByProject.get(r.project_id) ?? [];
        arr.push(r.status as string);
        cablesByProject.set(r.project_id, arr);
      }

      const { data: dRows } = await supabase
        .from("defects")
        .select("project_id, status, assigned_to")
        .in("project_id", projectIds);
      for (const r of dRows ?? []) {
        if (r.status !== "RESOLVED") {
          defectsByProject.set(r.project_id, (defectsByProject.get(r.project_id) ?? 0) + 1);
          if (r.assigned_to === userId) myOpenDefects++;
        }
      }

      // My open pull tasks across projects
      const { count: tCount } = await supabase
        .from("pull_tasks")
        .select("id", { count: "exact", head: true })
        .in("project_id", projectIds)
        .not("status", "in", "(DONE,CANCELLED,TESTED)");
      myOpenTasks = tCount ?? 0;
    }

    const PULLED_SET = new Set(["PULLED", "TERMINATED", "TESTED", "DONE"]);
    const TERM_SET = new Set(["TERMINATED", "TESTED", "DONE"]);
    const TEST_SET = new Set(["TESTED", "DONE"]);

    const projectsWithProgress = (projects ?? []).map((p) => {
      const statuses = cablesByProject.get(p.id) ?? [];
      const total = statuses.length;
      let pulled = 0,
        terminated = 0,
        tested = 0;
      for (const s of statuses) {
        if (PULLED_SET.has(s)) pulled++;
        if (TERM_SET.has(s)) terminated++;
        if (TEST_SET.has(s)) tested++;
      }
      const denom = total * 3;
      const progressPct = denom > 0 ? Math.round(((pulled + terminated + tested) / denom) * 100) : 0;
      return {
        ...p,
        cablesTotal: total,
        progressPct,
        openDefects: defectsByProject.get(p.id) ?? 0,
      };
    });

    return {
      projects: projectsWithProgress,
      totals: {
        projects: projectsWithProgress.length,
        myOpenDefects,
        myOpenTasks,
      },
    };
  });
