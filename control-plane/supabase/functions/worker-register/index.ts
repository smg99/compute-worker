import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const body = await req.json();
    const { installation_id, product_id, worker_version, platform, architecture } = body;
    if (!installation_id || !product_id || !worker_version) return json({ error: "missing_fields" }, 400);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const workerToken = `${crypto.randomUUID()}-${crypto.randomUUID()}`;
    const tokenHash = await sha256(workerToken);
    const { error } = await supabase.from("workers").upsert({
      id: installation_id, installation_id, platform: platform || "unknown", architecture: architecture || "unknown",
      version: worker_version, last_seen_at: new Date().toISOString(), is_online: true, revoked_at: null,
    }, { onConflict: "installation_id" });
    if (error) throw error;
    const { error: tokenError } = await supabase.from("worker_tokens").upsert({
      worker_id: installation_id, token_hash: tokenHash, last_used_at: new Date().toISOString(),
    });
    if (tokenError) throw tokenError;
    return json({ worker_token: workerToken, registered: true });
  } catch (error) {
    console.error(error);
    return json({ error: "registration_failed" }, 500);
  }
});
