import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { supabaseForUser, notAuthenticated, errorResult } from "../supabase";

export default defineTool({
  name: "list_project_cables",
  title: "Kabely v projektu",
  description: "Vrátí kabely v projektu. Volitelně omezí počet výsledků (výchozí 200).",
  inputSchema: {
    projectId: z.string().uuid().describe("UUID projektu."),
    limit: z.number().int().min(1).max(1000).optional().describe("Max počet záznamů."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ projectId, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const { data, error } = await supabaseForUser(ctx)
      .from("cables")
      .select(
        "id, code, cable_type, status, endpoint_id, patch_panel_id, port_id, planned_length_m, actual_length_m, created_at",
      )
      .eq("project_id", projectId)
      .order("code", { ascending: true })
      .limit(limit ?? 200);
    if (error) return errorResult(error.message);
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { cables: data ?? [] },
    };
  },
});
