import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL || 'https://invalid.local', process.env.SUPABASE_SERVICE_ROLE_KEY || 'invalid', { auth: { persistSession: false } });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const allowed = ['worker_enabled','active_workload','allowed_workloads','max_cpu_percent','max_memory_mb','heartbeat_interval_seconds','configuration_version','minimum_worker_version','kill_switch','expires_at'];
    const patch = Object.fromEntries(Object.entries(body.patch || {}).filter(([key]) => allowed.includes(key)));
    if (!body.worker_id || !body.product_id || Object.keys(patch).length === 0) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    patch.expires_at ||= new Date(Date.now() + 10 * 60_000).toISOString();
    const { data, error } = await supabase.from('worker_configurations').update(patch).eq('worker_id', body.worker_id).eq('product_id', body.product_id).select().single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
}
