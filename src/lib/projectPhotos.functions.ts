import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();

export type PhotoSource = "lobby" | "endpoint" | "defect" | "protocol" | "day_plan";

export type ArchivePhoto = {
  id: string;
  source: PhotoSource;
  url: string | null;
  caption: string | null;
  createdAt: string;
  uploaderId: string | null;
  uploaderName: string | null;
  linkTo: string;
  linkLabel: string;
};

async function signBatch(
  supabase: any,
  bucket: string,
  paths: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const { data } = await supabase.storage.from(bucket).createSignedUrls(paths, 60 * 60);
  for (const s of (data as any[]) ?? []) {
    if (s?.path && s?.signedUrl) out.set(s.path as string, s.signedUrl as string);
  }
  return out;
}

export const listAllProjectPhotos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: uuid }).parse(d))
  .handler(async ({ data, context }): Promise<ArchivePhoto[]> => {
    const { supabase } = context;
    const pid = data.projectId;

    const [lobby, endpoints, defects, protocols, dayPlans] = await Promise.all([
      supabase
        .from("project_lobby_photos")
        .select("id, storage_path, caption, created_at, uploaded_by")
        .eq("project_id", pid)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("endpoint_photos")
        .select("id, storage_path, caption, created_at, created_by, endpoint_id, endpoints(code, label)")
        .eq("project_id", pid)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("defect_photos")
        .select("id, storage_path, caption, created_at, created_by, defect_id, defects(code, title)")
        .eq("project_id", pid)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("protocol_photos")
        .select("id, storage_path, caption, created_at, uploaded_by, protocol_id, project_protocols(code, title)")
        .eq("project_id", pid)
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("pull_day_plan_photos")
        .select("id, storage_path, caption, created_at, created_by, day_plan_id, pull_day_plans(code, plan_date)")
        .eq("project_id", pid)
        .order("created_at", { ascending: false })
        .limit(500),
    ]);

    const errs = [lobby.error, endpoints.error, defects.error, protocols.error, dayPlans.error].filter(Boolean);
    if (errs.length > 0) throw new Error(errs[0]!.message);

    // Sign URLs per bucket
    const [lobbyUrls, endpointUrls, defectUrls, protocolUrls, planUrls] = await Promise.all([
      signBatch(supabase, "project-lobby-photos", (lobby.data as any[])?.map((r) => r.storage_path) ?? []),
      signBatch(supabase, "endpoint-photos", (endpoints.data as any[])?.map((r) => r.storage_path) ?? []),
      signBatch(supabase, "defect-photos", (defects.data as any[])?.map((r) => r.storage_path) ?? []),
      signBatch(supabase, "protocol-photos", (protocols.data as any[])?.map((r) => r.storage_path) ?? []),
      signBatch(supabase, "pull-day-plan-photos", (dayPlans.data as any[])?.map((r) => r.storage_path) ?? []),
    ]);

    // Collect uploader IDs for names
    const ids = new Set<string>();
    const collect = (rows: any[] | null, key: string) => {
      for (const r of rows ?? []) if (r[key]) ids.add(r[key]);
    };
    collect(lobby.data as any[], "uploaded_by");
    collect(endpoints.data as any[], "created_by");
    collect(defects.data as any[], "created_by");
    collect(protocols.data as any[], "uploaded_by");
    collect(dayPlans.data as any[], "created_by");

    const nameMap = new Map<string, string>();
    if (ids.size > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", Array.from(ids));
      for (const p of (profs as any[]) ?? []) {
        nameMap.set(p.id as string, (p.full_name as string) || (p.email as string) || "—");
      }
    }

    const out: ArchivePhoto[] = [];

    for (const r of (lobby.data as any[]) ?? []) {
      out.push({
        id: `lobby-${r.id}`,
        source: "lobby",
        url: lobbyUrls.get(r.storage_path) ?? null,
        caption: r.caption ?? null,
        createdAt: r.created_at,
        uploaderId: r.uploaded_by ?? null,
        uploaderName: r.uploaded_by ? nameMap.get(r.uploaded_by) ?? null : null,
        linkTo: `/projects/${pid}/lobby?tab=chat`,
        linkLabel: "Lobby chat",
      });
    }
    for (const r of (endpoints.data as any[]) ?? []) {
      const ep = r.endpoints ?? {};
      const label = ep.code || ep.label || "endpoint";
      out.push({
        id: `endpoint-${r.id}`,
        source: "endpoint",
        url: endpointUrls.get(r.storage_path) ?? null,
        caption: r.caption ?? null,
        createdAt: r.created_at,
        uploaderId: r.created_by ?? null,
        uploaderName: r.created_by ? nameMap.get(r.created_by) ?? null : null,
        linkTo: `/projects/${pid}/endpoints`,
        linkLabel: `Endpoint · ${label}`,
      });
    }
    for (const r of (defects.data as any[]) ?? []) {
      const d = r.defects ?? {};
      const label = d.code || d.title || "závada";
      out.push({
        id: `defect-${r.id}`,
        source: "defect",
        url: defectUrls.get(r.storage_path) ?? null,
        caption: r.caption ?? null,
        createdAt: r.created_at,
        uploaderId: r.created_by ?? null,
        uploaderName: r.created_by ? nameMap.get(r.created_by) ?? null : null,
        linkTo: `/projects/${pid}/defects`,
        linkLabel: `Závada · ${label}`,
      });
    }
    for (const r of (protocols.data as any[]) ?? []) {
      const p = r.project_protocols ?? {};
      const label = p.code || p.title || "protokol";
      out.push({
        id: `protocol-${r.id}`,
        source: "protocol",
        url: protocolUrls.get(r.storage_path) ?? null,
        caption: r.caption ?? null,
        createdAt: r.created_at,
        uploaderId: r.uploaded_by ?? null,
        uploaderName: r.uploaded_by ? nameMap.get(r.uploaded_by) ?? null : null,
        linkTo: `/projects/${pid}/protocols`,
        linkLabel: `Protokol · ${label}`,
      });
    }
    for (const r of (dayPlans.data as any[]) ?? []) {
      const p = r.pull_day_plans ?? {};
      const label = p.code || p.plan_date || "day plán";
      out.push({
        id: `plan-${r.id}`,
        source: "day_plan",
        url: planUrls.get(r.storage_path) ?? null,
        caption: r.caption ?? null,
        createdAt: r.created_at,
        uploaderId: r.created_by ?? null,
        uploaderName: r.created_by ? nameMap.get(r.created_by) ?? null : null,
        linkTo: `/projects/${pid}/work`,
        linkLabel: `Day plán · ${label}`,
      });
    }

    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return out;
  });
