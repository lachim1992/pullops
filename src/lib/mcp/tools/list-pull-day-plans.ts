import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { supabaseForUser, notAuthenticated, errorResult } from "../supabase";

export default defineTool({
  name: "list_pull_day_plans",
  title: "Plány tahání",
  description: "Vrátí plány tahání (pull day plans) v projektu.",
  inputSchema: {
    projectId: z.string().uuid().describe("UUID projektu."),
    limit: z.number().int().min(1).max(500).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ projectId, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const { data, error } = await supabaseForUser(ctx)
      .from("pull_day_plans")
      .select(
        "id, name, floor_plan_id, planned_date, completion_ready, completion_ready_at, created_at",
      )
      .eq("project_id", projectId)
      .order("planned_date", { ascending: false, nullsFirst: false })
      .limit(limit ?? 100);
    if (error) return errorResult(error.message);
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { plans: data ?? [] },
    };
  },
});
