import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { supabaseForUser, notAuthenticated, errorResult } from "../supabase";

export default defineTool({
  name: "get_project",
  title: "Detail projektu",
  description: "Vrátí detail jednoho projektu podle ID (respektuje členství v projektu).",
  inputSchema: {
    projectId: z.string().uuid().describe("UUID projektu."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ projectId }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const { data, error } = await supabaseForUser(ctx)
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .maybeSingle();
    if (error) return errorResult(error.message);
    if (!data) return errorResult("Projekt nenalezen nebo bez přístupu.");
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { project: data },
    };
  },
});
