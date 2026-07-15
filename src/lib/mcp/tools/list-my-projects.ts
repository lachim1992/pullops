import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

import { supabaseForUser, notAuthenticated, errorResult } from "../supabase";

export default defineTool({
  name: "list_my_projects",
  title: "Seznam mých projektů",
  description:
    "Vrátí projekty, kterých je přihlášený uživatel členem. Volitelně filtruje podle organizace.",
  inputSchema: {
    organizationId: z
      .string()
      .uuid()
      .optional()
      .describe("Volitelné UUID organizace pro filtrování."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ organizationId }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    let q = supabaseForUser(ctx)
      .from("projects")
      .select("id, organization_id, code, name, status, is_demo, customer, address, created_at")
      .order("created_at", { ascending: false });
    if (organizationId) q = q.eq("organization_id", organizationId);
    const { data, error } = await q;
    if (error) return errorResult(error.message);
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { projects: data ?? [] },
    };
  },
});
