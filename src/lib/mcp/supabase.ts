import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

function stripBearerFetch(key: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    // sb_publishable_/sb_secret_ keys are opaque, not JWTs.
    if (
      (key.startsWith("sb_publishable_") || key.startsWith("sb_secret_")) &&
      headers.get("Authorization") === `Bearer ${key}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", key);
    return fetch(input, { ...init, headers });
  };
}

export function supabaseForUser(ctx: ToolContext): SupabaseClient {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, key, {
    global: {
      headers: { Authorization: `Bearer ${ctx.getToken()}` },
      fetch: stripBearerFetch(key),
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function notAuthenticated() {
  return {
    content: [{ type: "text" as const, text: "Nejste přihlášen(a)." }],
    isError: true,
  };
}

export function errorResult(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}
