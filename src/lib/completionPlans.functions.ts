import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

export const ENDPOINT_STATUSES = ["PLANNED", "PULLED", "TERMINATED", "TESTED", "DONE", "CANCELLED"] as const;
export type EndpointCompletionStatus = (typeof ENDPOINT_STATUSES)[number];

/** Statuses user can set manually from the completion editor.
 *  PULLED is read-only here — it's owned by the Pull mode. */
export const ENDPOINT_MANUAL_STATUSES = ["PLANNED", "TERMINATED", "TESTED", "DONE", "CANCELLED"] as const;

export const PANEL_STATUSES = ["PLANNED", "WIRED", "MEASURED"] as const;
export type PanelCompletionStatus = (typeof PANEL_STATUSES)[number];

/** List all day plans of a project with completion & pulled progress. */
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
        .select("id, status, from_endpoint_id, to_endpoint_id")
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

    const cableById = new Map<string, { status: string; from: string | null; to: string | null }>();
    for (const c of cablesRes.data ?? []) {
      cableById.set(c.id as string, {
        status: c.status as string,
        from: (c.from_endpoint_id as string | null) ?? null,
        to: (c.to_endpoint_id as string | null) ?? null,
      });
    }

    const cablesByPlan = new Map<string, string[]>();
    for (const r of dpcRes.data ?? []) {
      const pid = r.day_plan_id as string;
      const arr = cablesByPlan.get(pid) ?? [];
      arr.push(r.cable_id as string);
      cablesByPlan.set(pid, arr);
    }

    // endpoints completion for each plan: aggregate endpoints touched by cables
    const { data: endpointsRes, error: eperr } = await supabase
      .from("endpoints")
      .select("id, completion_status" as never)
      .eq("project_id", data.projectId);
    if (eperr) throw new Error(eperr.message);
    const epStatus = new Map<string, string>();
    for (const e of (endpointsRes as any[]) ?? []) {
      epStatus.set(e.id as string, (e.completion_status as string) ?? "PLANNED");
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
      let pulledOrBeyond = 0;
      const epSet = new Set<string>();
      for (const cid of cids) {
        const c = cableById.get(cid);
        if (!c) continue;
        if (["PULLED", "TERMINATED", "TESTED", "DONE"].includes(c.status)) pulledOrBeyond++;
        if (c.from) epSet.add(c.from);
        if (c.to) epSet.add(c.to);
      }
      let epDone = 0;
      for (const e of epSet) {
        if (epStatus.get(e) === "DONE") epDone++;
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
        pulledCables: pulledOrBeyond,
        allPulled: total > 0 && pulledOrBeyond === total,
        endpointCount: epSet.size,
        endpointDone: epDone,
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

    let cables: Array<{
      id: string;
      code: string;
      status: string;
      fromEndpointId: string | null;
      toEndpointId: string | null;
      fromEndpointCode: string | null;
      toEndpointCode: string | null;
    }> = [];
    const endpointIds = new Set<string>();
    if (cableIds.length > 0) {
      const { data: cbs, error: cerr } = await supabase
        .from("cables")
        .select("id, code, status, from_endpoint_id, to_endpoint_id")
        .in("id", cableIds);
      if (cerr) throw new Error(cerr.message);
      const epLookup = new Map<string, string>();
      const epRawIds: string[] = [];
      for (const c of cbs ?? []) {
        if (c.from_endpoint_id) epRawIds.push(c.from_endpoint_id as string);
        if (c.to_endpoint_id) epRawIds.push(c.to_endpoint_id as string);
      }
      if (epRawIds.length > 0) {
        const { data: eps } = await supabase
          .from("endpoints")
          .select("id, code")
          .in("id", Array.from(new Set(epRawIds)));
        for (const e of eps ?? []) epLookup.set(e.id as string, e.code as string);
      }
      cables = (cbs ?? []).map((c) => {
        const from = (c.from_endpoint_id as string | null) ?? null;
        const to = (c.to_endpoint_id as string | null) ?? null;
        if (from) endpointIds.add(from);
        if (to) endpointIds.add(to);
        return {
          id: c.id as string,
          code: c.code as string,
          status: c.status as string,
          fromEndpointId: from,
          toEndpointId: to,
          fromEndpointCode: from ? epLookup.get(from) ?? null : null,
          toEndpointCode: to ? epLookup.get(to) ?? null : null,
        };
      });
    }

    // All endpoints on the plan's floor plan (union with cable-referenced endpoints
    // from other floors, if any).
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
        endpoints = ((eps as any[]) ?? []).map((e) => ({
          id: e.id as string,
          code: e.code as string,
          kind: (e.endpoint_kind as string | null) ?? null,
          floorPlanId: (e.floor_plan_id as string | null) ?? null,
          normX: Number(e.norm_x ?? 0),
          normY: Number(e.norm_y ?? 0),
          completionStatus: ((e.completion_status as string) ?? "PLANNED") as EndpointCompletionStatus,
        }));
      }
    }

    // Patch panels on the same floor plan — either directly (panel.floor_plan_id)
    // or via a rack on that floor.
    let panels: Array<{
      id: string;
      code: string;
      name: string | null;
      portCount: number;
      completionStatus: PanelCompletionStatus;
    }> = [];
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
      panels = ((pps as any[]) ?? []).map((p) => ({
        id: p.id as string,
        code: p.code as string,
        name: (p.name as string | null) ?? null,
        portCount: Number(p.port_count ?? 0),
        completionStatus: ((p.completion_status as string) ?? "PLANNED") as PanelCompletionStatus,
      }));
    }

    // Patch ports for these panels + cables connected via ports
    let ports: Array<{
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
      } | null;
    }> = [];
    if (panels.length > 0) {
      const panelIds = panels.map((p) => p.id);
      const { data: portRows, error: portErr } = await supabase
        .from("patch_ports")
        .select("id, panel_id, port_number, label")
        .in("panel_id", panelIds)
        .order("port_number", { ascending: true });
      if (portErr) throw new Error(portErr.message);
      const portIds = (portRows ?? []).map((p) => p.id as string);
      const portCables = new Map<
        string,
        { id: string; code: string; status: string; notes: string | null; peerEndpointId: string | null }
      >();
      const peerEndpointIds = new Set<string>();
      if (portIds.length > 0) {
        const { data: cbs } = await supabase
          .from("cables")
          .select(
            "id, code, status, notes, from_port_id, to_port_id, from_endpoint_id, to_endpoint_id",
          )
          .eq("project_id", projectId)
          .or(`from_port_id.in.(${portIds.join(",")}),to_port_id.in.(${portIds.join(",")})`);
        for (const c of (cbs as any[]) ?? []) {
          const fromPort = (c.from_port_id as string | null) ?? null;
          const toPort = (c.to_port_id as string | null) ?? null;
          const peerEp = fromPort
            ? ((c.to_endpoint_id as string | null) ?? null)
            : ((c.from_endpoint_id as string | null) ?? null);
          if (peerEp) peerEndpointIds.add(peerEp);
          const key = fromPort ?? toPort;
          if (key) {
            portCables.set(key, {
              id: c.id as string,
              code: c.code as string,
              status: c.status as string,
              notes: (c.notes as string | null) ?? null,
              peerEndpointId: peerEp,
            });
          }
        }
      }
      const peerCodes = new Map<string, string>();
      if (peerEndpointIds.size > 0) {
        const { data: eps } = await supabase
          .from("endpoints")
          .select("id, code")
          .in("id", Array.from(peerEndpointIds));
        for (const e of eps ?? []) peerCodes.set(e.id as string, e.code as string);
      }
      ports = (portRows ?? []).map((p) => {
        const c = portCables.get(p.id as string);
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
                peerEndpointCode: c.peerEndpointId ? peerCodes.get(c.peerEndpointId) ?? null : null,
              }
            : null,
        };
      });
    }




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

export const setCableMeasured = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ cableId: uuid, note: z.string().max(2000).nullable().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { status: "TERMINATED" };
    if (data.note && data.note.trim().length > 0) patch.notes = data.note.trim();
    const { error } = await context.supabase
      .from("cables")
      .update(patch as never)
      .eq("id", data.cableId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const setEndpointCompletionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ endpointId: uuid, status: z.enum(ENDPOINT_STATUSES) }).parse(d),
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
