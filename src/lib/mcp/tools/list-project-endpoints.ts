import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { supabaseForUser, notAuthenticated, errorResult } from "../supabase";

export default defineTool({
  name: "list_project_endpoints",
  title: "Endpointy v projektu",
  description: "Vrátí endpointy v projektu (zásuvky, kamery, AP atd.).",
  inputSchema: {
    projectId: z.string().uuid().describe("UUID projektu."),
    limit: z.number().int().min(1).max(1000).optional().describe("Max počet záznamů."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ projectId, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const { data, error } = await supabaseForUser(ctx)
      .from("endpoints")
      .select(
        "id, code, label, kind_id, floor_plan_id, x, y, completion_status, created_at",
      )
      .eq("project_id", projectId)
      .order("code", { ascending: true })
      .limit(limit ?? 200);
    if (error) return errorResult(error.message);
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { endpoints: data ?? [] },
    };
  },
});
