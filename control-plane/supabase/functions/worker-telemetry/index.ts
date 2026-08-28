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
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const body = await req.json();
    const { installation_id, product_id, events } = body;
    if (!installation_id || !product_id || !Array.isArray(events) || !token) return json({ error: "unauthorized" }, 401);
    if (events.length > 100) return json({ error: "too_many_events" }, 413);
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const tokenHash = await sha256(token);
    const { data: authRow } = await supabase.from("worker_tokens").select("worker_id").eq("token_hash", tokenHash).eq("worker_id", installation_id).single();
    if (!authRow) return json({ error: "unauthorized" }, 401);
    const { data: worker } = await supabase.from("workers").select("revoked_at").eq("id", installation_id).single();
    if (!worker || worker.revoked_at) return json({ error: "revoked" }, 403);

    const heartbeats: any[] = [];
    const otherEvents: any[] = [];
    for (const ev of events) {
      if (!ev || typeof ev.type !== "string" || typeof ev.timestamp !== "number") continue;
      if (ev.type === "HEARTBEAT") heartbeats.push({
        worker_id: installation_id, product_id, workload_id: ev.active_workload || null, status: ev.status || "unknown",
        uptime: Number(ev.uptime || 0), reported_at: new Date(ev.timestamp).toISOString(),
        metrics: { platform: ev.platform, architecture: ev.architecture },
      });
      else otherEvents.push({ worker_id: installation_id, product_id, event_type: ev.type, details: ev.details || null, occurred_at: new Date(ev.timestamp).toISOString() });
    }
    if (heartbeats.length) await supabase.from("heartbeats").insert(heartbeats);
    if (otherEvents.length) await supabase.from("worker_events").insert(otherEvents);
    await supabase.from("workers").update({ last_seen_at: new Date().toISOString(), is_online: true }).eq("id", installation_id);
    return json({ success: true, count: heartbeats.length + otherEvents.length });
  } catch (error) {
    console.error(error);
    return json({ error: "telemetry_failed" }, 500);
  }
});
