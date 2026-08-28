import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import * as jwt from "https://deno.land/x/djwt@v2.9/mod.ts"

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
    const jwtSecret = Deno.env.get('WORKER_JWT_SECRET') || 'default_dev_secret_replace_in_prod'
    
    const supabase = createClient(supabaseUrl, supabaseKey)
    const body = await req.json()
    const { installation_id, product_id, worker_version, platform, architecture } = body

    if (!installation_id || !product_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    // 1. Upsert Worker Identity
    const { data: worker, error: workerErr } = await supabase
      .from('workers')
      .upsert({
        id: installation_id, // For simplicity, using installation_id as primary key if valid UUID
        installation_id,
        platform: platform || 'unknown',
        architecture: architecture || 'unknown',
        version: worker_version || '1.0.0',
        last_seen_at: new Date().toISOString()
      }, { onConflict: 'installation_id' })
      .select()
      .single()

    if (workerErr) throw workerErr

    // 2. Fetch Policy/Configuration
    const { data: config } = await supabase
      .from('worker_configurations')
      .select('*')
      .eq('worker_id', worker.id)
      .eq('product_id', product_id)
      .single()

    // 3. Prepare Config Payload
    let payload = {
      worker_enabled: false,
      active_workload: null,
      allowed_workloads: [],
      max_cpu_percent: 0,
      max_memory_mb: 0,
      heartbeat_interval_seconds: 60,
      configuration_version: 'safe_fallback',
      minimum_worker_version: null,
      kill_switch: true
    }

    if (config) {
      payload = {
        worker_enabled: config.worker_enabled,
        active_workload: config.active_workload,
        allowed_workloads: config.allowed_workloads || [],
        max_cpu_percent: config.max_cpu_percent,
        max_memory_mb: config.max_memory_mb,
        heartbeat_interval_seconds: config.heartbeat_interval_seconds,
        configuration_version: config.configuration_version,
        minimum_worker_version: config.minimum_worker_version,
        kill_switch: config.kill_switch
      }
    }

    // 4. Sign JWT
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(jwtSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    
    const token = await jwt.create(
      { alg: 'HS256', typ: 'JWT' },
      { ...payload, exp: Math.floor(Date.now() / 1000) + 300 }, // Expire in 5 mins
      key
    )

    return new Response(JSON.stringify({ token }), {
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
