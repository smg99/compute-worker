import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    const body = await req.json()
    const { installation_id, product_id, events } = body

    if (!installation_id || !events || !Array.isArray(events)) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    // Insert telemetry events
    const heartbeats = []
    const otherEvents = []

    for (const ev of events) {
      if (ev.type === 'HEARTBEAT') {
        heartbeats.push({
          worker_id: installation_id,
          product_id: product_id,
          workload_id: ev.active_workload,
          status: ev.status,
          uptime: ev.uptime,
          reported_at: new Date(ev.timestamp).toISOString(),
          metrics: {
             platform: ev.platform,
             architecture: ev.architecture
          }
        })
      } else {
        otherEvents.push({
          worker_id: installation_id,
          event_type: ev.type,
          details: ev.details || null,
          occurred_at: new Date(ev.timestamp).toISOString()
        })
      }
    }

    if (heartbeats.length > 0) {
      await supabase.from('heartbeats').insert(heartbeats)
    }
    
    if (otherEvents.length > 0) {
      await supabase.from('worker_events').insert(otherEvents)
    }

    // Also update worker last_seen_at
    await supabase.from('workers').update({ last_seen_at: new Date().toISOString() }).eq('installation_id', installation_id)

    return new Response(JSON.stringify({ success: true, count: events.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error(error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
