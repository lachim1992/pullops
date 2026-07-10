import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({ organizationId: z.string().uuid() });

// Port maps from ČB_Patch_Panely PDF (5×24U). Empty string = unused port.
const PANELS: Array<{ code: string; name: string; labels: string[] }> = [
  {
    code: "PP1",
    name: "Rack 1 – Rezervy",
    labels: [
      "KVS1 REZ", "KVS09 R", "EPR02 R", "EPR04 R", "KVS25 R", "OAT R1", "FCE R1", "FCE R2",
      "DLV R1", "MAP01 R", "CAMO R", "PRINT02", "RACK 2 REZ", "PRICE 01 R",
      "CSO01 R", "CSO02 R", "CSO03 R", "CSO04 R", "CSO05 R", "CSO06 R", "CSO07 R", "CSO08 R",
      "POS01 R", "POS02 R",
    ],
  },
  {
    code: "PP2",
    name: "Rack 1 – CSO / POS / PT",
    labels: [
      "CSO01", "CSO02", "CSO03", "CSO04", "CSO05", "CSO06", "CSO07", "CSO08",
      "POS01", "POS02",
      "CSO01 PT", "CSO02 PT", "CSO03 PT", "CSO04 PT", "CSO05 PT", "CSO06 PT", "CSO07 PT", "CSO08 PT",
      "POS01 PT", "POS02 PT",
      "POS10", "TR", "", "",
    ],
  },
  {
    code: "PP3",
    name: "Rack 1 – Kuchyň KVS/EPR/ORB",
    labels: [
      "KVS1", "KVS2", "KVS03", "KVS04", "KVS05", "KVS06", "KVS09", "KVS10", "KVS11", "KVS12",
      "KVS22", "KVS23", "KVS25", "EPR01", "EPR02", "EPR03", "EPR04", "ORB01", "ORB04", "DLV SCALE",
      "", "", "", "",
    ],
  },
  {
    code: "PP4",
    name: "Rack 1 – FC / AP / Ostatní",
    labels: [
      "FC MP R1", "FC MP R2", "FC MP01", "FC MP02", "FC MP03", "FC SCR01", "FC SCR02", "FC SCR03",
      "MAP01", "PRINT01", "CAMO", "PRICE 01", "MUSIC", "NVR01", "ENERGIE", "TESTO FCE",
      "TESTO FRZ", "AP FRZ", "AP CSO", "AP OAT", "WC1", "WC2", "", "",
    ],
  },
  {
    code: "PP5",
    name: "Rack 1 – TSS",
    labels: [
      "TSS01", "TSS02", "TSS03", "TSS04", "TSS05", "TSS06", "TSS07", "TSS08",
      "TSS09", "TSS10", "TSS11", "TSS12", "TSS FCE",
      "", "", "", "", "", "", "", "", "", "", "",
    ],
  },
];

function kindFor(label: string): "WORKSTATION" | "AP" | "CAMERA" | "PATCH" | "OTHER" {
  const l = label.toUpperCase();
  if (l.startsWith("AP ")) return "AP";
  if (l.startsWith("CSO") || l.startsWith("POS")) return "WORKSTATION";
  if (l.startsWith("CAMO") || l.startsWith("NVR")) return "CAMERA";
  return "OTHER";
}

export const seedCeskeBudejoviceDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const organization_id = data.organizationId;

    // 1) project via RPC (ensures roles + project_members)
    const code = `CB2-DEMO-${Date.now().toString(36).slice(-4)}`;
    const { data: projectId, error: pErr } = await supabase.rpc("create_project_tx", {
      p_organization_id: organization_id,
      p_code: code,
      p_name: "McDonald's České Budějovice II (demo)",
      p_address: "Č. Budějovice, CZ00034",
      p_customer: "McDonald's ČR",
      p_timezone: "Europe/Prague",
      p_is_demo: true,
    });
    if (pErr || !projectId) throw new Error(pErr?.message ?? "create_project_tx failed");
    const project_id = projectId as string;

    // 2) floor plan
    const { data: fp, error: fpErr } = await supabase
      .from("floor_plans")
      .insert({
        project_id,
        organization_id,
        name: "Restaurace – přízemí",
        level: 1,
        display_order: 1,
      })
      .select("id")
      .single();
    if (fpErr) throw new Error(fpErr.message);

    // 3) cable type
    const { data: ct, error: ctErr } = await supabase
      .from("cable_types")
      .insert({
        project_id,
        organization_id,
        code: "Cat6A UTP",
        description: "Standardní UTP kabeláž (McD ČB2)",
        default_reserve_m: 3.0,
      })
      .select("id")
      .single();
    if (ctErr) throw new Error(ctErr.message);

    // 4a) rack entities (new model) + calibration
    const rackEntities: Array<{ code: string; name: string; x: number; y: number }> = [
      { code: "RACK-A", name: "Hlavní rack", x: 0.08, y: 0.92 },
      { code: "RACK-B", name: "Vedlejší rack", x: 0.5, y: 0.92 },
    ];
    const rackEntityIds: Record<string, string> = {};
    for (const r of rackEntities) {
      const { data: row, error } = await supabase
        .from("racks")
        .insert({
          project_id,
          floor_plan_id: fp.id,
          code: r.code,
          name: r.name,
          x: r.x,
          y: r.y,
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(`rack ${r.code}: ${error.message}`);
      rackEntityIds[r.code] = row.id as string;
    }

    await supabase.from("floor_plan_calibrations").insert({
      project_id,
      floor_plan_id: fp.id,
      point_a_norm_x: 0.1,
      point_a_norm_y: 0.1,
      point_b_norm_x: 0.9,
      point_b_norm_y: 0.1,
      real_distance_m: 20,
    });

    // 4) patch panels — trigger auto-fills ports 1..N (assigned to RACK-A)
    const panelIds: Record<string, string> = {};
    for (const p of PANELS) {
      const { data: row, error } = await supabase
        .from("patch_panels")
        .insert({
          project_id,
          organization_id,
          code: p.code,
          name: p.name,
          port_count: 24,
          floor_plan_id: fp.id,
          rack_id: rackEntityIds["RACK-A"],
          created_by: userId,
        })
        .select("id")
        .single();
      if (error) throw new Error(`patch_panels ${p.code}: ${error.message}`);
      panelIds[p.code] = row.id as string;
    }

    // 4b) main bundle (kmen) going from rack area across the plan
    const bundlePoints = [
      { x: 0.1, y: 0.9 },
      { x: 0.1, y: 0.5 },
      { x: 0.6, y: 0.5 },
      { x: 0.85, y: 0.5 },
    ];
    const { data: bundleRow, error: bundleErr } = await supabase
      .from("cable_bundles")
      .insert({
        project_id,
        floor_plan_id: fp.id,
        code: "BND-01",
        rack_id: rackEntityIds["RACK-A"],
        points: bundlePoints,
        created_by: userId,
      })
      .select("id")
      .single();
    if (bundleErr) throw new Error(`bundle: ${bundleErr.message}`);
    const bundleId = bundleRow.id as string;

    // 5) fetch generated ports for these panels
    const { data: portRows, error: portErr } = await supabase
      .from("patch_ports")
      .select("id, panel_id, port_number")
      .in("panel_id", Object.values(panelIds));
    if (portErr) throw new Error(portErr.message);

    const portByPanelNumber = new Map<string, string>();
    for (const r of portRows ?? []) {
      portByPanelNumber.set(`${r.panel_id}:${r.port_number}`, r.id as string);
    }

    // 6) label ports + collect labels for endpoints/cables
    type LabeledPort = { portId: string; label: string; kind: ReturnType<typeof kindFor> };
    const labeled: LabeledPort[] = [];
    for (const p of PANELS) {
      for (let i = 0; i < p.labels.length; i++) {
        const label = p.labels[i].trim();
        if (!label) continue;
        const portId = portByPanelNumber.get(`${panelIds[p.code]}:${i + 1}`);
        if (!portId) continue;
        await supabase.from("patch_ports").update({ label }).eq("id", portId);
        labeled.push({ portId, label, kind: kindFor(label) });
      }
    }

    // 7) create one endpoint + one cable per labeled port (dedupe endpoints by code)
    const endpointByCode = new Map<string, string>();
    const rng = (i: number) => {
      // Deterministic-ish scatter across the plan
      const gx = (i * 37) % 20;
      const gy = Math.floor((i * 37) / 20) % 20;
      return { x: 0.05 + (gx / 20) * 0.9, y: 0.05 + (gy / 20) * 0.9 };
    };
    let idx = 0;
    for (const lp of labeled) {
      if (!endpointByCode.has(lp.label)) {
        const { x, y } = rng(idx++);
        const { data: ep, error: epErr } = await supabase
          .from("endpoints")
          .insert({
            project_id,
            organization_id,
            floor_plan_id: fp.id,
            code: lp.label,
            label: lp.label,
            endpoint_kind: lp.kind,
            norm_x: x,
            norm_y: y,
          })
          .select("id")
          .single();
        if (epErr) throw new Error(`endpoint ${lp.label}: ${epErr.message}`);
        endpointByCode.set(lp.label, ep.id as string);
      }
      const endpointId = endpointByCode.get(lp.label)!;
      const { error: cErr } = await supabase.from("cables").insert({
        project_id,
        organization_id,
        code: lp.label,
        cable_type_id: ct.id,
        from_port_id: lp.portId,
        to_endpoint_id: endpointId,
        status: "PLANNED",
        created_by: userId,
      });
      if (cErr) throw new Error(`cable ${lp.label}: ${cErr.message}`);
    }

    // 8) rack points on plan (PATCH endpoints)
    const rackPoints: Array<{ code: string; x: number; y: number }> = [
      { code: "RACK-A", x: 0.08, y: 0.92 },
      { code: "RACK-B", x: 0.5, y: 0.92 },
    ];
    const rackIds: Record<string, string> = {};
    for (const rp of rackPoints) {
      const { data: ep, error } = await supabase
        .from("endpoints")
        .insert({
          project_id,
          organization_id,
          floor_plan_id: fp.id,
          code: rp.code,
          label: rp.code,
          endpoint_kind: "PATCH",
          norm_x: rp.x,
          norm_y: rp.y,
        })
        .select("id")
        .single();
      if (error) throw new Error(`rack ${rp.code}: ${error.message}`);
      rackIds[rp.code] = ep.id as string;
    }

    // 9) group cables under their to_endpoint (operational units)
    const { data: cablesRows } = await supabase
      .from("cables")
      .select("id, to_endpoint_id")
      .eq("project_id", project_id);
    const groupRows =
      (cablesRows ?? [])
        .filter((c) => c.to_endpoint_id)
        .map((c, i) => ({
          project_id,
          endpoint_id: c.to_endpoint_id as string,
          cable_id: c.id as string,
          sequence: i,
        }));
    if (groupRows.length > 0) {
      const { error: gErr } = await supabase.from("endpoint_cable_groups").insert(groupRows);
      if (gErr) throw new Error(`endpoint_cable_groups: ${gErr.message}`);
    }

    // 10) sample route Rack-A → first WORKSTATION endpoint
    const firstWorkstation =
      (cablesRows ?? []).find((c) => c.to_endpoint_id)?.to_endpoint_id ?? null;
    if (firstWorkstation) {
      const { data: routeRow, error: rErr } = await supabase
        .from("cable_routes")
        .insert({
          project_id,
          organization_id,
          floor_plan_id: fp.id,
          name: `RACK-A → demo`,
          rack_endpoint_id: rackIds["RACK-A"],
          from_endpoint_id: rackIds["RACK-A"],
          to_endpoint_id: firstWorkstation,
        })
        .select("id")
        .single();
      if (rErr) throw new Error(`route: ${rErr.message}`);
      const routeId = routeRow.id as string;
      const pts = [
        { x: 0.08, y: 0.92 },
        { x: 0.08, y: 0.5 },
        { x: 0.3, y: 0.5 },
        { x: 0.3, y: 0.2 },
      ];
      await supabase.from("cable_route_points").insert(
        pts.map((p, i) => ({
          route_id: routeId,
          project_id,
          floor_plan_id: fp.id,
          sequence: i,
          norm_x: p.x,
          norm_y: p.y,
        })),
      );
    }

    return {
      projectId: project_id,
      floorPlanId: fp.id as string,
      organizationId: organization_id,
      panels: PANELS.length,
      cables: labeled.length,
      endpoints: endpointByCode.size + rackPoints.length,
      groups: groupRows.length,
    };
  });


