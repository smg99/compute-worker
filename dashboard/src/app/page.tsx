import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(url || 'https://invalid.local', key || 'invalid', { auth: { persistSession: false } });

export default async function DashboardPage() {
  if (!url || !key) return <main className="p-8"><h1 className="text-2xl font-bold">Compute Worker Control Plane</h1><p className="mt-4 text-red-600">SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.</p></main>;
  const [{ data: workers }, { data: configs }, { data: heartbeats }, { data: events }] = await Promise.all([
    supabase.from('workers').select('*').order('last_seen_at', { ascending: false }).limit(200),
    supabase.from('worker_configurations').select('*').order('updated_at', { ascending: false }).limit(200),
    supabase.from('heartbeats').select('*').order('reported_at', { ascending: false }).limit(50),
    supabase.from('worker_events').select('*').order('occurred_at', { ascending: false }).limit(50),
  ]);
  const online = (workers || []).filter(w => !w.revoked_at && Date.now() - new Date(w.last_seen_at).getTime() < 120000).length;
  return <main className="min-h-screen bg-slate-50 text-slate-900 p-8">
    <div className="max-w-7xl mx-auto space-y-8">
      <header><h1 className="text-3xl font-bold">Compute Worker Control Plane</h1><p className="text-slate-500 mt-1">Private fleet health, authorization and workload policy.</p></header>
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card title="Workers" value={workers?.length || 0}/><Card title="Online" value={online}/><Card title="Policies" value={configs?.length || 0}/><Card title="Recent events" value={events?.length || 0}/>
      </section>
      <section className="bg-white rounded-xl border overflow-hidden"><div className="p-5 border-b"><h2 className="font-semibold text-xl">Workers</h2></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><Th>Worker</Th><Th>Platform</Th><Th>Version</Th><Th>Last seen</Th><Th>Revoked</Th></tr></thead><tbody>{(workers || []).map(w => <tr key={w.id} className="border-t"><td className="p-4 font-mono text-xs">{w.installation_id}</td><td className="p-4">{w.platform}/{w.architecture}</td><td className="p-4">{w.version}</td><td className="p-4">{new Date(w.last_seen_at).toLocaleString()}</td><td className="p-4">{w.revoked_at ? 'YES' : 'NO'}</td></tr>)}</tbody></table></div></section>
      <section className="bg-white rounded-xl border overflow-hidden"><div className="p-5 border-b"><h2 className="font-semibold text-xl">Policies</h2></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><Th>Worker</Th><Th>Product</Th><Th>Enabled</Th><Th>Workload</Th><Th>CPU</Th><Th>Kill switch</Th><Th>Expires</Th></tr></thead><tbody>{(configs || []).map(c => <tr key={c.id} className="border-t"><td className="p-4 font-mono text-xs">{c.worker_id}</td><td className="p-4">{c.product_id}</td><td className="p-4">{c.worker_enabled ? 'YES' : 'NO'}</td><td className="p-4">{c.active_workload || 'none'}</td><td className="p-4">{c.max_cpu_percent}%</td><td className="p-4 font-semibold">{c.kill_switch ? 'ON' : 'OFF'}</td><td className="p-4">{new Date(c.expires_at).toLocaleString()}</td></tr>)}</tbody></table></div></section>
      <section className="bg-white rounded-xl border overflow-hidden"><div className="p-5 border-b"><h2 className="font-semibold text-xl">Recent telemetry</h2></div><div className="divide-y">{(heartbeats || []).slice(0, 20).map(h => <div key={h.id} className="p-4 flex flex-wrap gap-4 justify-between text-sm"><span className="font-mono">{h.worker_id}</span><span>{h.workload_id || 'none'}</span><span>{h.status}</span><span>{new Date(h.reported_at).toLocaleString()}</span></div>)}</div></section>
    </div>
  </main>;
}
function Card({title,value}:{title:string,value:number}) { return <div className="bg-white border rounded-xl p-5"><div className="text-xs uppercase text-slate-500 font-semibold">{title}</div><div className="text-3xl font-bold mt-2">{value}</div></div>; }
function Th({children}:{children:React.ReactNode}) { return <th className="text-left p-4 font-semibold">{children}</th>; }
