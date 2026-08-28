import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jwt from "https://deno.land/x/djwt@v2.9/mod.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const body = await req.json();
    const { installation_id, product_id, worker_version } = body;
    if (!installation_id || !product_id || !worker_version || !token) return json({ error: "unauthorized" }, 401);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const tokenHash = await sha256(token);
    const { data: authRow } = await supabase.from("worker_tokens").select("worker_id").eq("token_hash", tokenHash).eq("worker_id", installation_id).single();
    if (!authRow) return json({ error: "unauthorized" }, 401);
    await supabase.from("worker_tokens").update({ last_used_at: new Date().toISOString() }).eq("worker_id", installation_id);
    const { data: worker } = await supabase.from("workers").select("revoked_at").eq("id", installation_id).single();
    if (!worker || worker.revoked_at) return json({ error: "revoked" }, 403);
    await supabase.from("workers").update({ version: worker_version, last_seen_at: new Date().toISOString(), is_online: true }).eq("id", installation_id);
    const { data: config } = await supabase.from("worker_configurations").select("*").eq("worker_id", installation_id).eq("product_id", product_id).single();
    const now = Math.floor(Date.now() / 1000);
    const payload = config ? {
      worker_enabled: config.worker_enabled, active_workload: config.active_workload, allowed_workloads: config.allowed_workloads || [],
      max_cpu_percent: config.max_cpu_percent, max_memory_mb: config.max_memory_mb, heartbeat_interval_seconds: config.heartbeat_interval_seconds,
      configuration_version: config.configuration_version, minimum_worker_version: config.minimum_worker_version, kill_switch: config.kill_switch,
      policy_id: config.id, issued_at: now, expires_at: Math.floor(new Date(config.expires_at).getTime() / 1000),
    } : {
      worker_enabled: false, active_workload: null, allowed_workloads: [], max_cpu_percent: 0, max_memory_mb: 0,
      heartbeat_interval_seconds: 60, configuration_version: "safe_fallback", minimum_worker_version: null, kill_switch: true,
      issued_at: now, expires_at: now + 60,
    };
    // Bind the signed policy to this worker's bearer token. No global signing secret is shipped to workers.
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(token), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const tokenOut = await jwt.create({ alg: "HS256", typ: "JWT" }, payload, key);
    return json({ token: tokenOut });
  } catch (error) {
    console.error(error);
    return json({ error: "config_failed" }, 500);
  }
});
