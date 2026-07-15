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

// ============================================================================
// Rich organization dashboard — everything in one call, scoped to org
// ============================================================================

export type OrgDashboard = {
  kpis: {
    projects: number;
    projectsActive: number;
    cablesTotal: number;
    cablesPulled: number;
    cablesTerminated: number;
    cablesTested: number;
    cablesDone: number;
    metersTotal: number;
    metersPulled: number;
    metersTerminated: number;
    endpointsTotal: number;
    endpointsDone: number;
    racks: number;
    patchPanels: number;
    portsTotal: number;
    portsUsed: number;
    openDefects: number;
    myOpenDefects: number;
    myOpenTasks: number;
    plansTotal: number;
    plansActive: number;
    plansReady: number;
    plansToday: number;
    progressPct: number;
  };
  daily: Array<{ date: string; pulled: number; terminated: number; tested: number }>;
  topProjects: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    is_demo: boolean;
    progressPct: number;
    meters: number;
    cablesTotal: number;
    openDefects: number;
  }>;
  activity: Array<{
    date: string;
    kind: "pull" | "terminate" | "test" | "defect" | "plan_ready";
    label: string;
    projectCode: string | null;
  }>;
  fun: {
    longestCable: { code: string; length_m: number; projectCode: string | null } | null;
    topTechnician: { userId: string; name: string; count: number } | null;
    daysSinceDefect: number | null;
    demoProjects: number;
  };
};

export const getOrgDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ organizationId: uuid }).parse(d))
  .handler(async ({ data, context }): Promise<OrgDashboard> => {
    const { supabase, userId } = context;
    const orgId = data.organizationId;

    // ── projects in this org ────────────────────────────────────────────────
    const { data: projects, error: pErr } = await supabase
      .from("projects")
      .select("id, name, code, status, is_demo, organization_id")
      .eq("organization_id", orgId);
    if (pErr) throw new Error(dbErrorMessage(pErr));

    const projectIds = (projects ?? []).map((p) => p.id);
    const projectCodeById = new Map<string, string>(
      (projects ?? []).map((p) => [p.id, p.code]),
    );

    // Empty short-circuit
    if (projectIds.length === 0) {
      return {
        kpis: {
          projects: 0,
          projectsActive: 0,
          cablesTotal: 0,
          cablesPulled: 0,
          cablesTerminated: 0,
          cablesTested: 0,
          cablesDone: 0,
          metersTotal: 0,
          metersPulled: 0,
          metersTerminated: 0,
          endpointsTotal: 0,
          endpointsDone: 0,
          racks: 0,
          patchPanels: 0,
          portsTotal: 0,
          portsUsed: 0,
          openDefects: 0,
          myOpenDefects: 0,
          myOpenTasks: 0,
          plansTotal: 0,
          plansActive: 0,
          plansReady: 0,
          plansToday: 0,
          progressPct: 0,
        },
        daily: buildEmptyDaily(14),
        topProjects: [],
        activity: [],
        fun: { longestCable: null, topTechnician: null, daysSinceDefect: null, demoProjects: 0 },
      };
    }

    // ── parallel fetches ────────────────────────────────────────────────────
    const [
      cablesRes,
      endpointsRes,
      racksRes,
      panelsRes,
      defectsRes,
      tasksRes,
      plansRes,
      recentTasksRes,
      longestRes,
    ] = await Promise.all([
      supabase
        .from("cables")
        .select("id, project_id, code, status, computed_length_m, override_length_m")
        .in("project_id", projectIds),
      supabase
        .from("endpoints")
        .select("project_id, completion_status")
        .in("project_id", projectIds),
      supabase
        .from("racks")
        .select("id", { count: "exact", head: true })
        .in("project_id", projectIds),
      supabase
        .from("patch_panels")
        .select("id, port_count")
        .in("project_id", projectIds),
      supabase
        .from("defects")
        .select("project_id, status, assigned_to, created_at")
        .in("project_id", projectIds),
      supabase
        .from("pull_tasks")
        .select("id, project_id, status, terminated_by, terminated_at, tested_at, done_at")
        .in("project_id", projectIds),
      supabase
        .from("pull_day_plans")
        .select("id, project_id, status, planned_date, completion_ready")
        .in("project_id", projectIds),
      supabase
        .from("pull_tasks")
        .select("terminated_by, terminated_at")
        .in("project_id", projectIds)
        .not("terminated_by", "is", null)
        .gte("terminated_at", new Date(Date.now() - 30 * 86400_000).toISOString()),
      supabase
        .from("cables")
        .select("code, project_id, computed_length_m, override_length_m")
        .in("project_id", projectIds)
        .order("computed_length_m", { ascending: false, nullsFirst: false })
        .limit(1),
    ]);

    // ── cables aggregate ────────────────────────────────────────────────────
    const cables = cablesRes.data ?? [];
    const PULLED_SET = new Set(["PULLED", "TERMINATED", "TESTED", "DONE"]);
    const TERM_SET = new Set(["TERMINATED", "TESTED", "DONE"]);
    const TEST_SET = new Set(["TESTED", "DONE"]);
    let cPulled = 0,
      cTerm = 0,
      cTest = 0,
      cDone = 0;
    let mTotal = 0,
      mPulled = 0,
      mTerm = 0;
    const perProject = new Map<
      string,
      { total: number; pulled: number; term: number; test: number; meters: number }
    >();

    for (const c of cables) {
      const s = c.status as string;
      const len = Number(c.override_length_m ?? c.computed_length_m ?? 0);
      mTotal += len;
      if (PULLED_SET.has(s)) {
        cPulled++;
        mPulled += len;
      }
      if (TERM_SET.has(s)) {
        cTerm++;
        mTerm += len;
      }
      if (TEST_SET.has(s)) cTest++;
      if (s === "DONE") cDone++;
      const pp = perProject.get(c.project_id) ?? { total: 0, pulled: 0, term: 0, test: 0, meters: 0 };
      pp.total++;
      pp.meters += len;
      if (PULLED_SET.has(s)) pp.pulled++;
      if (TERM_SET.has(s)) pp.term++;
      if (TEST_SET.has(s)) pp.test++;
      perProject.set(c.project_id, pp);
    }

    // ── endpoints ───────────────────────────────────────────────────────────
    const endpoints = endpointsRes.data ?? [];
    const endpointsTotal = endpoints.length;
    const endpointsDone = endpoints.filter((e) => e.completion_status === "DONE").length;

    // ── panels/ports ────────────────────────────────────────────────────────
    const panels = panelsRes.data ?? [];
    const portsTotal = panels.reduce((s, p) => s + (p.port_count ?? 0), 0);
    // ports used ≈ distinct cables with from_port_id or to_port_id (rough)
    const portsUsed = cables.filter(() => false).length; // placeholder; better below
    // Compute portsUsed by another light query
    const { count: portsUsedCount } = await supabase
      .from("cables")
      .select("id", { count: "exact", head: true })
      .in("project_id", projectIds)
      .not("from_port_id", "is", null);

    // ── defects ─────────────────────────────────────────────────────────────
    const defects = defectsRes.data ?? [];
    let openDefects = 0,
      myOpenDefects = 0;
    const defectsByProject = new Map<string, number>();
    let lastDefectAt: number | null = null;
    for (const d of defects) {
      const t = new Date(d.created_at as string).getTime();
      if (!lastDefectAt || t > lastDefectAt) lastDefectAt = t;
      if (d.status !== "RESOLVED") {
        openDefects++;
        if (d.assigned_to === userId) myOpenDefects++;
        defectsByProject.set(d.project_id, (defectsByProject.get(d.project_id) ?? 0) + 1);
      }
    }
    const daysSinceDefect =
      lastDefectAt != null
        ? Math.max(0, Math.floor((Date.now() - lastDefectAt) / 86400_000))
        : null;

    // ── pull tasks ──────────────────────────────────────────────────────────
    const tasks = tasksRes.data ?? [];
    const FINAL = new Set(["DONE", "CANCELLED", "TESTED"]);
    const myOpenTasks = tasks.filter((t) => !FINAL.has(t.status as string)).length;

    // Build 14-day trend from terminated_at + tested_at
    const daily = buildEmptyDaily(14);
    const dayIdx = new Map(daily.map((d, i) => [d.date, i]));
    for (const t of tasks) {
      if (t.terminated_at) {
        const k = (t.terminated_at as string).slice(0, 10);
        const i = dayIdx.get(k);
        if (i != null) {
          daily[i].terminated++;
          daily[i].pulled++;
        }
      }
      if (t.tested_at) {
        const k = (t.tested_at as string).slice(0, 10);
        const i = dayIdx.get(k);
        if (i != null) daily[i].tested++;
      }
    }

    // ── plans ───────────────────────────────────────────────────────────────
    const plans = plansRes.data ?? [];
    const today = new Date().toISOString().slice(0, 10);
    const PLAN_ACTIVE = new Set(["PLANNED", "IN_PROGRESS", "READY", "OPEN"]);
    const plansActive = plans.filter((p) => PLAN_ACTIVE.has((p.status ?? "PLANNED") as string)).length;
    const plansReady = plans.filter((p) => p.completion_ready).length;
    const plansToday = plans.filter((p) => p.planned_date === today).length;

    // ── top projects (by progress) ──────────────────────────────────────────
    const topProjects = (projects ?? [])
      .map((p) => {
        const stat = perProject.get(p.id) ?? { total: 0, pulled: 0, term: 0, test: 0, meters: 0 };
        const denom = stat.total * 3;
        const progressPct =
          denom > 0 ? Math.round(((stat.pulled + stat.term + stat.test) / denom) * 100) : 0;
        return {
          id: p.id,
          code: p.code,
          name: p.name,
          status: p.status as string,
          is_demo: !!p.is_demo,
          progressPct,
          meters: Math.round(stat.meters),
          cablesTotal: stat.total,
          openDefects: defectsByProject.get(p.id) ?? 0,
        };
      })
      .sort((a, b) => b.progressPct - a.progressPct || b.cablesTotal - a.cablesTotal);

    // ── activity feed (last 10 events across defects/plans/tasks) ───────────
    type Ev = OrgDashboard["activity"][number];
    const events: Ev[] = [];
    for (const t of tasks) {
      if (t.terminated_at)
        events.push({
          date: t.terminated_at as string,
          kind: "terminate",
          label: "Kabel zakončen",
          projectCode: projectCodeById.get(t.project_id) ?? null,
        });
      if (t.tested_at)
        events.push({
          date: t.tested_at as string,
          kind: "test",
          label: "Kabel otestován",
          projectCode: projectCodeById.get(t.project_id) ?? null,
        });
    }
    for (const d of defects) {
      events.push({
        date: d.created_at as string,
        kind: "defect",
        label: d.status === "RESOLVED" ? "Závada uzavřena" : "Nová závada",
        projectCode: projectCodeById.get(d.project_id) ?? null,
      });
    }
    const activity = events
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 12);

    // ── fun: longest cable ──────────────────────────────────────────────────
    const longest = (longestRes.data ?? [])[0];
    const longestCable = longest
      ? {
          code: longest.code as string,
          length_m: Math.round(Number(longest.override_length_m ?? longest.computed_length_m ?? 0)),
          projectCode: projectCodeById.get(longest.project_id as string) ?? null,
        }
      : null;

    // ── fun: top technician (last 30 days) ──────────────────────────────────
    const techCounts = new Map<string, number>();
    for (const r of recentTasksRes.data ?? []) {
      const u = r.terminated_by as string | null;
      if (!u) continue;
      techCounts.set(u, (techCounts.get(u) ?? 0) + 1);
    }
    let topTechnician: OrgDashboard["fun"]["topTechnician"] = null;
    if (techCounts.size > 0) {
      const [uid, count] = [...techCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", uid).maybeSingle();
      topTechnician = { userId: uid, name: prof?.full_name || "Technik", count };
    }

    const cablesTotal = cables.length;
    const denomAll = cablesTotal * 3;
    const progressPct =
      denomAll > 0 ? Math.round(((cPulled + cTerm + cTest) / denomAll) * 100) : 0;

    const projectsActive = (projects ?? []).filter(
      (p) => p.status && !["done", "archived", "cancelled"].includes(p.status as string),
    ).length;

    return {
      kpis: {
        projects: projects?.length ?? 0,
        projectsActive,
        cablesTotal,
        cablesPulled: cPulled,
        cablesTerminated: cTerm,
        cablesTested: cTest,
        cablesDone: cDone,
        metersTotal: Math.round(mTotal),
        metersPulled: Math.round(mPulled),
        metersTerminated: Math.round(mTerm),
        endpointsTotal,
        endpointsDone,
        racks: racksRes.count ?? 0,
        patchPanels: panels.length,
        portsTotal,
        portsUsed: portsUsedCount ?? 0,
        openDefects,
        myOpenDefects,
        myOpenTasks,
        plansTotal: plans.length,
        plansActive,
        plansReady,
        plansToday,
        progressPct,
      },
      daily,
      topProjects,
      activity,
      fun: {
        longestCable,
        topTechnician,
        daysSinceDefect,
        demoProjects: (projects ?? []).filter((p) => p.is_demo).length,
      },
    };
  });

function buildEmptyDaily(days: number) {
  const out: Array<{ date: string; pulled: number; terminated: number; tested: number }> = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400_000);
    out.push({ date: d.toISOString().slice(0, 10), pulled: 0, terminated: 0, tested: 0 });
  }
  return out;
}

