import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

/** All persisted endpoint completion statuses (some are legacy/auto). */
export const ENDPOINT_STATUSES = ["PLANNED", "TERMINATED", "CANCELLED"] as const;
export type EndpointCompletionStatus = (typeof ENDPOINT_STATUSES)[number];

/** Manual statuses the user can pick in the Endpoints editor. "Hotovo" is auto. */
export const ENDPOINT_MANUAL_STATUSES = ["PLANNED", "TERMINATED", "CANCELLED"] as const;

/** Patch panel completion statuses. "MEASURED" was retired — proměření žije na kabelu. */
export const PANEL_STATUSES = ["PLANNED", "WIRED"] as const;
export type PanelCompletionStatus = (typeof PANEL_STATUSES)[number];

/** List all day plans of a project with completion & termination progress. */
export const listCompletionOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [plansRes, dpcRes, cablesRes, fpsRes, docsRes] = await Promise.all([
      supabase
        .from("pull_day_plans")
        .select(
          "id, name, sort_order, planned_date, floor_plan_id, completion_ready, completion_ready_at" as never,
        )
        .eq("project_id", data.projectId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("pull_day_plan_cables")
        .select("day_plan_id, cable_id")
        .eq("project_id", data.projectId),
      supabase
        .from("cables")
        .select("id, status, from_endpoint_id, to_endpoint_id, from_port_id, to_port_id, tested_at" as never)
        .eq("project_id", data.projectId),
      supabase
        .from("floor_plans")
        .select("id, name, level, document_id")
        .eq("project_id", data.projectId),
      supabase
        .from("project_documents")
        .select("id, storage_path, mime_type")
        .eq("project_id", data.projectId),
    ]);
    for (const r of [plansRes, dpcRes, cablesRes, fpsRes, docsRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    // Panels & ports for termination derivation on the PP side
    const [panelsRes, portsRes, endpointsRes] = await Promise.all([
      supabase
        .from("patch_panels")
        .select("id, completion_status" as never)
        .eq("project_id", data.projectId),
      supabase
        .from("patch_ports")
        .select("id, panel_id")
        .eq("project_id", data.projectId),
      supabase
        .from("endpoints")
        .select("id, completion_status" as never)
        .eq("project_id", data.projectId),
    ]);
    for (const r of [panelsRes, portsRes, endpointsRes]) {
      if (r.error) throw new Error(r.error.message);
    }

    const panelStatus = new Map<string, string>();
    for (const p of (panelsRes.data as any[]) ?? []) {
      panelStatus.set(p.id as string, (p.completion_status as string) ?? "PLANNED");
    }
    const portPanel = new Map<string, string>();
    for (const p of portsRes.data ?? []) {
      portPanel.set(p.id as string, p.panel_id as string);
    }
    const epStatus = new Map<string, string>();
    for (const e of (endpointsRes.data as any[]) ?? []) {
      epStatus.set(e.id as string, (e.completion_status as string) ?? "PLANNED");
    }

    function endTerminated(endpointId: string | null, portId: string | null): boolean {
      if (endpointId) return epStatus.get(endpointId) === "TERMINATED";
      if (portId) {
        const panelId = portPanel.get(portId);
        return panelId ? panelStatus.get(panelId) === "WIRED" : false;
      }
      return false;
    }

    type CableInfo = {
      status: string;
      from: string | null;
      to: string | null;
      terminated: boolean;
      tested: boolean;
    };
    const cableById = new Map<string, CableInfo>();
    for (const c of (cablesRes.data as any[]) ?? []) {
      const fromEp = (c.from_endpoint_id as string | null) ?? null;
      const toEp = (c.to_endpoint_id as string | null) ?? null;
      const fromPort = (c.from_port_id as string | null) ?? null;
      const toPort = (c.to_port_id as string | null) ?? null;
      const terminated = endTerminated(fromEp, fromPort) && endTerminated(toEp, toPort);
      cableById.set(c.id as string, {
        status: c.status as string,
        from: fromEp,
        to: toEp,
        terminated,
        tested: c.tested_at != null,
      });
    }

    const cablesByPlan = new Map<string, string[]>();
    for (const r of dpcRes.data ?? []) {
      const pid = r.day_plan_id as string;
      const arr = cablesByPlan.get(pid) ?? [];
      arr.push(r.cable_id as string);
      cablesByPlan.set(pid, arr);
    }

    const fpById = new Map<string, { name: string; level: number; document_id: string | null }>();
    for (const f of fpsRes.data ?? []) {
      fpById.set(f.id as string, {
        name: f.name as string,
        level: Number(f.level ?? 0),
        document_id: (f.document_id as string | null) ?? null,
      });
    }
    const docById = new Map<string, { storage_path: string; mime_type: string | null }>();
    for (const d of docsRes.data ?? []) {
      docById.set(d.id as string, {
        storage_path: d.storage_path as string,
        mime_type: (d.mime_type as string | null) ?? null,
      });
    }

    const plans = [];
    for (const p of (plansRes.data as any[]) ?? []) {
      const cids = cablesByPlan.get(p.id as string) ?? [];
      const total = cids.length;
      let pulledCables = 0;
      let terminatedCables = 0;
      let testedCables = 0;
      const epSet = new Set<string>();
      const cablesByEp = new Map<string, string[]>();
      for (const cid of cids) {
        const c = cableById.get(cid);
        if (!c) continue;
        // Pulled = anything past PLANNED (kept for compatibility with pull-mode)
        if (c.status !== "PLANNED" && c.status !== "CANCELLED") pulledCables++;
        if (c.terminated) terminatedCables++;
        if (c.tested) testedCables++;
        for (const eid of [c.from, c.to]) {
          if (!eid) continue;
          epSet.add(eid);
          const arr = cablesByEp.get(eid) ?? [];
          arr.push(cid);
          cablesByEp.set(eid, arr);
        }
      }
      // Endpoint is auto-Hotovo when it's TERMINATED and all its cables are tested.
      let endpointDone = 0;
      for (const eid of epSet) {
        if (epStatus.get(eid) !== "TERMINATED") continue;
        const cs = cablesByEp.get(eid) ?? [];
        const allTested = cs.length > 0 && cs.every((cid) => cableById.get(cid)?.tested === true);
        if (allTested) endpointDone++;
      }

      const fp = p.floor_plan_id ? fpById.get(p.floor_plan_id as string) ?? null : null;
      const doc = fp?.document_id ? docById.get(fp.document_id) ?? null : null;
      let documentUrl: string | null = null;
      if (doc?.storage_path) {
        const { data: signed } = await supabase.storage
          .from("project-documents")
          .createSignedUrl(doc.storage_path, 60 * 30);
        documentUrl = signed?.signedUrl ?? null;
      }
      plans.push({
        id: p.id as string,
        name: p.name as string,
        sortOrder: Number(p.sort_order ?? 0),
        plannedDate: (p.planned_date as string | null) ?? null,
        floorPlanId: (p.floor_plan_id as string | null) ?? null,
        floorPlanName: fp?.name ?? null,
        floorPlanLevel: fp?.level ?? null,
        documentUrl,
        mimeType: doc?.mime_type ?? null,
        completionReady: Boolean(p.completion_ready),
        completionReadyAt: (p.completion_ready_at as string | null) ?? null,
        totalCables: total,
        pulledCables,
        terminatedCables,
        testedCables,
        allPulled: total > 0 && pulledCables === total,
        endpointCount: epSet.size,
        endpointDone,
      });
    }

    return { plans };
  });

export const markPlanReadyForCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ planId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("mark_plan_ready_for_completion_tx" as never, {
      p_plan_id: data.planId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unmarkPlanReadyForCompletion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ planId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("unmark_plan_ready_for_completion_tx" as never, {
      p_plan_id: data.planId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Full data for the completion plan editor. */
export const getCompletionPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ planId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: plan, error: perr } = await supabase
      .from("pull_day_plans")
      .select(
        "id, project_id, name, planned_date, floor_plan_id, completion_ready, completion_ready_at" as never,
      )
      .eq("id", data.planId)
      .maybeSingle();
    if (perr) throw new Error(perr.message);
    if (!plan) throw new Error("plan not found");

    const projectId = (plan as any).project_id as string;
    const floorPlanId = (plan as any).floor_plan_id as string | null;

    const { data: dpc, error: dpcerr } = await supabase
      .from("pull_day_plan_cables")
      .select("cable_id, sort_order")
      .eq("day_plan_id", data.planId)
      .order("sort_order", { ascending: true });
    if (dpcerr) throw new Error(dpcerr.message);
    const cableIds = (dpc ?? []).map((r) => r.cable_id as string);

    type RawCable = {
      id: string;
      code: string;
      status: string;
      notes: string | null;
      fromEndpointId: string | null;
      toEndpointId: string | null;
      fromPortId: string | null;
      toPortId: string | null;
      testedAt: string | null;
    };
    let rawCables: RawCable[] = [];
    const endpointIds = new Set<string>();
    if (cableIds.length > 0) {
      const { data: cbs, error: cerr } = await supabase
        .from("cables")
        .select(
          "id, code, status, notes, from_endpoint_id, to_endpoint_id, from_port_id, to_port_id, tested_at" as never,
        )
        .in("id", cableIds);
      if (cerr) throw new Error(cerr.message);
      rawCables = ((cbs as any[]) ?? []).map((c) => {
        const from = (c.from_endpoint_id as string | null) ?? null;
        const to = (c.to_endpoint_id as string | null) ?? null;
        if (from) endpointIds.add(from);
        if (to) endpointIds.add(to);
        return {
          id: c.id as string,
          code: c.code as string,
          status: c.status as string,
          notes: (c.notes as string | null) ?? null,
          fromEndpointId: from,
          toEndpointId: to,
          fromPortId: (c.from_port_id as string | null) ?? null,
          toPortId: (c.to_port_id as string | null) ?? null,
          testedAt: (c.tested_at as string | null) ?? null,
        };
      });
    }

    // Endpoint codes lookup (for peer labels)
    const epLookup = new Map<string, string>();
    if (endpointIds.size > 0) {
      const { data: eps } = await supabase
        .from("endpoints")
        .select("id, code")
        .in("id", Array.from(endpointIds));
      for (const e of eps ?? []) epLookup.set(e.id as string, e.code as string);
    }

    // Endpoints on the plan's floor plan (union with cable-referenced endpoints).
    let endpoints: Array<{
      id: string;
      code: string;
      kind: string | null;
      floorPlanId: string | null;
      normX: number;
      normY: number;
      completionStatus: EndpointCompletionStatus;
    }> = [];
    {
      const orClauses: string[] = [];
      if (floorPlanId) orClauses.push(`floor_plan_id.eq.${floorPlanId}`);
      const extraIds = Array.from(endpointIds);
      if (extraIds.length > 0) orClauses.push(`id.in.(${extraIds.join(",")})`);
      if (orClauses.length > 0) {
        const { data: eps, error: eperr } = await supabase
          .from("endpoints")
          .select("id, code, endpoint_kind, floor_plan_id, norm_x, norm_y, completion_status" as never)
          .eq("project_id", projectId)
          .or(orClauses.join(","));
        if (eperr) throw new Error(eperr.message);
        endpoints = ((eps as any[]) ?? []).map((e) => {
          const raw = ((e.completion_status as string) ?? "PLANNED") as string;
          // Any non-manual legacy status collapses to PLANNED for the UI
          const status = (ENDPOINT_STATUSES as readonly string[]).includes(raw)
            ? (raw as EndpointCompletionStatus)
            : "PLANNED";
          return {
            id: e.id as string,
            code: e.code as string,
            kind: (e.endpoint_kind as string | null) ?? null,
            floorPlanId: (e.floor_plan_id as string | null) ?? null,
            normX: Number(e.norm_x ?? 0),
            normY: Number(e.norm_y ?? 0),
            completionStatus: status,
          };
        });
      }
    }

    // Patch panels + ports on the same floor.
    let panels: Array<{
      id: string;
      code: string;
      name: string | null;
      portCount: number;
      completionStatus: PanelCompletionStatus;
    }> = [];
    const portPanel = new Map<string, string>();
    if (floorPlanId) {
      const { data: racks } = await supabase
        .from("racks")
        .select("id")
        .eq("project_id", projectId)
        .eq("floor_plan_id", floorPlanId);
      const rackIds = (racks ?? []).map((r) => r.id as string);
      const orClauses = [`floor_plan_id.eq.${floorPlanId}`];
      if (rackIds.length > 0) orClauses.push(`rack_id.in.(${rackIds.join(",")})`);
      const { data: pps, error: pperr } = await supabase
        .from("patch_panels")
        .select("id, code, name, port_count, floor_plan_id, rack_id, completion_status" as never)
        .eq("project_id", projectId)
        .or(orClauses.join(","));
      if (pperr) throw new Error(pperr.message);
      panels = ((pps as any[]) ?? []).map((p) => {
        const raw = ((p.completion_status as string) ?? "PLANNED") as string;
        const status: PanelCompletionStatus =
          raw === "WIRED" ? "WIRED" : "PLANNED";
        return {
          id: p.id as string,
          code: p.code as string,
          name: (p.name as string | null) ?? null,
          portCount: Number(p.port_count ?? 0),
          completionStatus: status,
        };
      });
    }

    // Derive termination per end using the loaded endpoints/panels/ports
    const epStatusById = new Map<string, EndpointCompletionStatus>();
    for (const e of endpoints) epStatusById.set(e.id, e.completionStatus);
    const panelStatusById = new Map<string, PanelCompletionStatus>();
    for (const p of panels) panelStatusById.set(p.id, p.completionStatus);

    // Load port rows for these panels (needed for both port-panel map and Měření tab)
    let portRows: Array<{ id: string; panel_id: string; port_number: number; label: string | null }> = [];
    if (panels.length > 0) {
      const panelIds = panels.map((p) => p.id);
      const { data: prs, error: portErr } = await supabase
        .from("patch_ports")
        .select("id, panel_id, port_number, label")
        .in("panel_id", panelIds)
        .order("port_number", { ascending: true });
      if (portErr) throw new Error(portErr.message);
      portRows = (prs ?? []) as any;
      for (const r of portRows) portPanel.set(r.id, r.panel_id);
    }

    function endTerminated(endpointId: string | null, portId: string | null): boolean {
      if (endpointId) return epStatusById.get(endpointId) === "TERMINATED";
      if (portId) {
        const panelId = portPanel.get(portId);
        return panelId ? panelStatusById.get(panelId) === "WIRED" : false;
      }
      return false;
    }

    const cables = rawCables.map((c) => {
      const terminatedFrom = endTerminated(c.fromEndpointId, c.fromPortId);
      const terminatedTo = endTerminated(c.toEndpointId, c.toPortId);
      return {
        id: c.id,
        code: c.code,
        status: c.status,
        notes: c.notes,
        fromEndpointId: c.fromEndpointId,
        toEndpointId: c.toEndpointId,
        fromPortId: c.fromPortId,
        toPortId: c.toPortId,
        fromEndpointCode: c.fromEndpointId ? epLookup.get(c.fromEndpointId) ?? null : null,
        toEndpointCode: c.toEndpointId ? epLookup.get(c.toEndpointId) ?? null : null,
        terminatedFrom,
        terminatedTo,
        terminated: terminatedFrom && terminatedTo,
        tested: c.testedAt != null,
        testedAt: c.testedAt,
      };
    });

    // Enrich ports with their cable (for Měření tab)
    type PortRow = {
      id: string;
      panelId: string;
      portNumber: number;
      label: string | null;
      cable: {
        id: string;
        code: string;
        status: string;
        notes: string | null;
        peerEndpointCode: string | null;
        terminated: boolean;
        tested: boolean;
      } | null;
    };
    const cableByPortId = new Map<string, (typeof cables)[number]>();
    for (const c of cables) {
      if (c.fromPortId) cableByPortId.set(c.fromPortId, c);
      if (c.toPortId) cableByPortId.set(c.toPortId, c);
    }
    const ports: PortRow[] = portRows.map((p) => {
      const c = cableByPortId.get(p.id);
      const peerCode = c
        ? c.fromPortId === p.id
          ? c.toEndpointCode
          : c.fromEndpointCode
        : null;
      return {
        id: p.id as string,
        panelId: p.panel_id as string,
        portNumber: Number(p.port_number ?? 0),
        label: (p.label as string | null) ?? null,
        cable: c
          ? {
              id: c.id,
              code: c.code,
              status: c.status,
              notes: c.notes,
              peerEndpointCode: peerCode ?? null,
              terminated: c.terminated,
              tested: c.tested,
            }
          : null,
      };
    });

    // Floor plan + doc
    let floorPlan: {
      id: string;
      name: string;
      level: number;
      documentUrl: string | null;
      mimeType: string | null;
    } | null = null;
    if (floorPlanId) {
      const { data: fp } = await supabase
        .from("floor_plans")
        .select("id, name, level, document_id")
        .eq("id", floorPlanId)
        .maybeSingle();
      if (fp) {
        let documentUrl: string | null = null;
        let mimeType: string | null = null;
        if (fp.document_id) {
          const { data: doc } = await supabase
            .from("project_documents")
            .select("storage_path, mime_type")
            .eq("id", fp.document_id as string)
            .maybeSingle();
          if (doc?.storage_path) {
            const { data: signed } = await supabase.storage
              .from("project-documents")
              .createSignedUrl(doc.storage_path as string, 60 * 30);
            documentUrl = signed?.signedUrl ?? null;
            mimeType = (doc.mime_type as string | null) ?? null;
          }
        }
        floorPlan = {
          id: fp.id as string,
          name: fp.name as string,
          level: Number(fp.level ?? 0),
          documentUrl,
          mimeType,
        };
      }
    }

    return {
      plan: {
        id: (plan as any).id as string,
        projectId,
        name: (plan as any).name as string,
        plannedDate: ((plan as any).planned_date as string | null) ?? null,
        completionReady: Boolean((plan as any).completion_ready),
      },
      floorPlan,
      cables,
      endpoints,
      panels,
      ports,
    };
  });

/** Mark / unmark a cable as tested. Server-side enforces terminated pre-condition. */
export const setCableTested = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cableId: uuid, tested: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_cable_tested_tx" as never, {
      p_cable_id: data.cableId,
      p_tested: data.tested,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setEndpointCompletionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ endpointId: uuid, status: z.enum(ENDPOINT_MANUAL_STATUSES) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_endpoint_completion_status_tx" as never, {
      p_endpoint_id: data.endpointId,
      p_status: data.status,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setPatchPanelCompletionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ panelId: uuid, status: z.enum(PANEL_STATUSES) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("set_patch_panel_completion_status_tx" as never, {
      p_panel_id: data.panelId,
      p_status: data.status,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setCableCancelled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ cableId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("cables")
      .update({ status: "CANCELLED" } as never)
      .eq("id", data.cableId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
