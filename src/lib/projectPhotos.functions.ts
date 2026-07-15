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
  entityId: string | null;
};

export type ArchiveResult = {
  photos: ArchivePhoto[];
  warnings: string[];
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

async function safeQuery<T>(label: string, fn: () => Promise<T>, warnings: string[]): Promise<T | null> {
  try {
    return await fn();
  } catch (e: any) {
    warnings.push(`${label}: ${e?.message ?? String(e)}`);
    return null;
  }
}

export const listAllProjectPhotos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: uuid }).parse(d))
  .handler(async ({ data, context }): Promise<ArchiveResult> => {
    const { supabase } = context;
    const pid = data.projectId;
    const warnings: string[] = [];

    const runOne = async <T>(label: string, q: PromiseLike<{ data: T; error: any }>) => {
      try {
        const { data: rows, error } = await q;
        if (error) {
          warnings.push(`${label}: ${error.message}`);
          return null;
        }
        return rows;
      } catch (e: any) {
        warnings.push(`${label}: ${e?.message ?? String(e)}`);
        return null;
      }
    };

    const [lobby, endpoints, defects, protocols, dayPlans] = await Promise.all([
      runOne(
        "lobby",
        supabase
          .from("project_lobby_photos")
          .select("id, storage_path, caption, created_at, uploaded_by")
          .eq("project_id", pid)
          .order("created_at", { ascending: false })
          .limit(500),
      ),
      runOne(
        "endpoint",
        supabase
          .from("endpoint_photos")
          .select("id, storage_path, caption, created_at, created_by, endpoint_id, endpoints(code, label)")
          .eq("project_id", pid)
          .order("created_at", { ascending: false })
          .limit(500),
      ),
      runOne(
        "defect",
        supabase
          .from("defect_photos")
          .select("id, storage_path, caption, created_at, created_by, defect_id, defects(code, title)")
          .eq("project_id", pid)
          .order("created_at", { ascending: false })
          .limit(500),
      ),
      runOne(
        "protocol",
        supabase
          .from("protocol_photos")
          .select(
            "id, storage_path, caption, created_at, uploaded_by, protocol_id, project_protocols(reference_number, title)",
          )
          .eq("project_id", pid)
          .order("created_at", { ascending: false })
          .limit(500),
      ),
      runOne(
        "day_plan",
        supabase
          .from("pull_day_plan_photos")
          .select(
            "id, storage_path, caption, created_at, created_by, day_plan_id, pull_day_plans(name, planned_date)",
          )
          .eq("project_id", pid)
          .order("created_at", { ascending: false })
          .limit(500),
      ),
    ]);

    // Sign URLs per bucket (also robust)
    const [lobbyUrls, endpointUrls, defectUrls, protocolUrls, planUrls] = await Promise.all([
      signBatch(supabase, "project-lobby-photos", ((lobby as any[]) ?? []).map((r) => r.storage_path)),
      signBatch(supabase, "endpoint-photos", ((endpoints as any[]) ?? []).map((r) => r.storage_path)),
      signBatch(supabase, "defect-photos", ((defects as any[]) ?? []).map((r) => r.storage_path)),
      signBatch(supabase, "protocol-photos", ((protocols as any[]) ?? []).map((r) => r.storage_path)),
      signBatch(supabase, "pull-day-plan-photos", ((dayPlans as any[]) ?? []).map((r) => r.storage_path)),
    ]);

    // Collect uploader IDs for names
    const ids = new Set<string>();
    const collect = (rows: any[] | null, key: string) => {
      for (const r of rows ?? []) if (r[key]) ids.add(r[key]);
    };
    collect(lobby as any[] | null, "uploaded_by");
    collect(endpoints as any[] | null, "created_by");
    collect(defects as any[] | null, "created_by");
    collect(protocols as any[] | null, "uploaded_by");
    collect(dayPlans as any[] | null, "created_by");

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

    for (const r of ((lobby as any[]) ?? [])) {
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
        entityId: null,
      });
    }
    for (const r of ((endpoints as any[]) ?? [])) {
      const ep = r.endpoints ?? {};
      const label = ep.code || ep.label || "endpoint";
      const epId = r.endpoint_id as string | null;
      out.push({
        id: `endpoint-${r.id}`,
        source: "endpoint",
        url: endpointUrls.get(r.storage_path) ?? null,
        caption: r.caption ?? null,
        createdAt: r.created_at,
        uploaderId: r.created_by ?? null,
        uploaderName: r.created_by ? nameMap.get(r.created_by) ?? null : null,
        linkTo: epId
          ? `/projects/${pid}/endpoints?focus=${epId}`
          : `/projects/${pid}/endpoints`,
        linkLabel: `Endpoint · ${label}`,
        entityId: epId,
      });
    }
    for (const r of ((defects as any[]) ?? [])) {
      const d = r.defects ?? {};
      const label = d.code || d.title || "závada";
      const dId = r.defect_id as string | null;
      out.push({
        id: `defect-${r.id}`,
        source: "defect",
        url: defectUrls.get(r.storage_path) ?? null,
        caption: r.caption ?? null,
        createdAt: r.created_at,
        uploaderId: r.created_by ?? null,
        uploaderName: r.created_by ? nameMap.get(r.created_by) ?? null : null,
        linkTo: dId ? `/projects/${pid}/defects?focus=${dId}` : `/projects/${pid}/defects`,
        linkLabel: `Závada · ${label}`,
        entityId: dId,
      });
    }
    for (const r of ((protocols as any[]) ?? [])) {
      const p = r.project_protocols ?? {};
      const label = p.reference_number || p.title || "protokol";
      const pId = r.protocol_id as string | null;
      out.push({
        id: `protocol-${r.id}`,
        source: "protocol",
        url: protocolUrls.get(r.storage_path) ?? null,
        caption: r.caption ?? null,
        createdAt: r.created_at,
        uploaderId: r.uploaded_by ?? null,
        uploaderName: r.uploaded_by ? nameMap.get(r.uploaded_by) ?? null : null,
        linkTo: pId ? `/projects/${pid}/protocols?focus=${pId}` : `/projects/${pid}/protocols`,
        linkLabel: `Protokol · ${label}`,
        entityId: pId,
      });
    }
    for (const r of ((dayPlans as any[]) ?? [])) {
      const p = r.pull_day_plans ?? {};
      const label = p.name || p.planned_date || "day plán";
      const planId = r.day_plan_id as string | null;
      out.push({
        id: `plan-${r.id}`,
        source: "day_plan",
        url: planUrls.get(r.storage_path) ?? null,
        caption: r.caption ?? null,
        createdAt: r.created_at,
        uploaderId: r.created_by ?? null,
        uploaderName: r.created_by ? nameMap.get(r.created_by) ?? null : null,
        linkTo: planId
          ? `/projects/${pid}/plans/${planId}`
          : `/projects/${pid}/plans`,
        linkLabel: `Day plán · ${label}`,
        entityId: planId,
      });
    }

    out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return { photos: out, warnings };
  });
