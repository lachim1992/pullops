import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { supabaseForUser, notAuthenticated, errorResult } from "../supabase";

export default defineTool({
  name: "list_project_defects",
  title: "Závady v projektu",
  description: "Vrátí závady zaevidované v projektu.",
  inputSchema: {
    projectId: z.string().uuid().describe("UUID projektu."),
    limit: z.number().int().min(1).max(500).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ projectId, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const { data, error } = await supabaseForUser(ctx)
      .from("defects")
      .select("id, title, description, severity, status, created_at, updated_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(limit ?? 100);
    if (error) return errorResult(error.message);
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { defects: data ?? [] },
    };
  },
});
