import { createClient } from '@supabase/supabase-js';

// Server-side environment variables
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Initialize Supabase client for server-side use only
const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co', 
  SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key', 
  { auth: { persistSession: false } }
);

export const revalidate = 0; // Disable static rendering for this page

type TelemetryEvent = {
  id: string;
  created_at: string;
  installation_id: string;
  session_id: string;
  extension_version?: string;
  attempt_index: number;
  event_type: string;
  status: string;
  duration_ms?: number;
};

type Metrics = Record<string, number>;

export default async function DashboardPage({ searchParams }: { searchParams: { filter?: string } }) {
  const filter = searchParams.filter || 'today';
  
  let startDate = new Date();
  if (filter === 'today') {
    startDate.setHours(0, 0, 0, 0);
  } else if (filter === '24h') {
    startDate.setHours(startDate.getHours() - 24);
  } else if (filter === '7d') {
    startDate.setDate(startDate.getDate() - 7);
  } else {
    // all time
    startDate = new Date(0);
  }
  
  const endDate = new Date();

  // Run the queries in parallel
  const [metricsRes, allTimeRes, totalInstallsRes, recentEventsRes] = await Promise.all([
    supabase.rpc('get_telemetry_aggregates', { 
      start_date: startDate.toISOString(), 
      end_date: endDate.toISOString() 
    }),
    supabase.rpc('get_telemetry_aggregates', { 
      start_date: new Date(0).toISOString(), 
      end_date: endDate.toISOString() 
    }),
    supabase.rpc('get_total_installations'),
    supabase.from('automation_events')
      .select('id, created_at, installation_id, session_id, attempt_index, event_type, status, duration_ms, extension_version')
      .order('created_at', { ascending: false })
      .limit(100)
  ]);

  const error = metricsRes.error || allTimeRes.error || totalInstallsRes.error || recentEventsRes.error;

  if (error) {
    return (
      <main className="min-h-screen p-8 bg-gray-50 text-gray-900">
        <h1 className="text-2xl font-bold mb-4">Telemetry Dashboard</h1>
        <div className="bg-red-50 text-red-600 p-4 rounded-md border border-red-200">
          Failed to fetch telemetry data: {error.message}
        </div>
      </main>
    );
  }

  const metrics = metricsRes.data || {};
  const allTimeMetrics = allTimeRes.data || {};
  const totalInstallations = totalInstallsRes.data || 0;
  const recentEvents = recentEventsRes.data || [];

  return (
    <main className="min-h-screen p-8 bg-gray-50 text-gray-900">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <h1 className="text-3xl font-bold text-gray-800">Telemetry Dashboard</h1>
          
          <div className="flex bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <FilterLink currentFilter={filter} filter="today" label="Today" />
            <FilterLink currentFilter={filter} filter="24h" label="Last 24h" />
            <FilterLink currentFilter={filter} filter="7d" label="Last 7 Days" />
            <FilterLink currentFilter={filter} filter="all" label="All Time" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
          <div className="lg:col-span-2">
            <h2 className="text-xl font-semibold mb-4 text-gray-700">Metrics ({getFilterLabel(filter)})</h2>
            <MetricsGrid metrics={metrics} />
          </div>
          <div>
            <h2 className="text-xl font-semibold mb-4 text-gray-700">Installations Summary</h2>
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 flex flex-col gap-4">
              <div className="flex justify-between items-center pb-4 border-b border-gray-100">
                <span className="text-gray-600 font-medium">Total Unique (All Time)</span>
                <span className="text-2xl font-bold">{totalInstallations}</span>
              </div>
              <div className="flex justify-between items-center pb-4 border-b border-gray-100">
                <span className="text-gray-600 font-medium">Active (Selected Period)</span>
                <span className="text-2xl font-bold">{metrics.active_installations || 0}</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="text-gray-600 font-medium">Active (All Time)</span>
                <span className="text-2xl font-bold">{allTimeMetrics.active_installations || 0}</span>
              </div>
            </div>
          </div>
        </div>

        <section>
          <h2 className="text-xl font-semibold mb-4 text-gray-700">Recent Events (Max 100)</h2>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 font-medium">Time</th>
                  <th className="px-6 py-3 font-medium">Install ID</th>
                  <th className="px-6 py-3 font-medium">Session ID</th>
                  <th className="px-6 py-3 font-medium">Version</th>
                  <th className="px-6 py-3 font-medium">Attempt</th>
                  <th className="px-6 py-3 font-medium">Event</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentEvents.map((e: TelemetryEvent) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 whitespace-nowrap">
                      {new Date(e.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-3 text-gray-500 font-mono text-xs" title={e.installation_id}>
                      {e.installation_id.substring(0, 6)}
                    </td>
                    <td className="px-6 py-3 text-gray-500 font-mono text-xs" title={e.session_id}>
                      {e.session_id.substring(0, 6)}
                    </td>
                    <td className="px-6 py-3 text-gray-500">{e.extension_version || '1.0'}</td>
                    <td className="px-6 py-3">{e.attempt_index}</td>
                    <td className="px-6 py-3 font-medium text-gray-700">{e.event_type}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        e.status === 'success' ? 'bg-green-100 text-green-700' :
                        e.status === 'error' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-gray-500">
                      {e.duration_ms ? `${e.duration_ms}ms` : '-'}
                    </td>
                  </tr>
                ))}
                {recentEvents.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                      No events recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function getFilterLabel(filter: string) {
  switch (filter) {
    case 'today': return 'Today';
    case '24h': return 'Last 24 Hours';
    case '7d': return 'Last 7 Days';
    case 'all': return 'All Time';
    default: return 'Unknown';
  }
}

function FilterLink({ currentFilter, filter, label }: { currentFilter: string, filter: string, label: string }) {
  const isActive = currentFilter === filter;
  return (
    <a 
      href={`/?filter=${filter}`}
      className={`px-4 py-2 text-sm font-medium transition-colors ${
        isActive 
          ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-600' 
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
      }`}
    >
      {label}
    </a>
  );
}

function MetricsGrid({ metrics }: { metrics: Metrics }) {
  const attempts = metrics.attempts || 0;
  const calendarReached = metrics.calendar_reached || 0;
  const datesAvailable = metrics.dates_available || 0;
  const noDates = metrics.no_dates_available || 0;
  const slotsAvailable = metrics.slots_available || 0;
  const noSlots = metrics.no_slots_available || 0;
  const otpPages = metrics.otp_pages_reached || 0;
  const otpSuccess = metrics.otp_request_success || 0;
  const confirmed = metrics.bookings_confirmed || 0;
  const errors = metrics.errors || 0;
  const retries = metrics.retries || 0;

  const conversionRate = attempts > 0 ? ((confirmed / attempts) * 100).toFixed(1) + '%' : '0%';
  const otpPageConversion = calendarReached > 0 ? ((otpPages / calendarReached) * 100).toFixed(1) + '%' : '0%';
  const bookingConversion = otpPages > 0 ? ((confirmed / otpPages) * 100).toFixed(1) + '%' : '0%';
  const noDateRate = calendarReached > 0 ? ((noDates / calendarReached) * 100).toFixed(1) + '%' : '0%';
  const noSlotRate = datesAvailable > 0 ? ((noSlots / datesAvailable) * 100).toFixed(1) + '%' : '0%';

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      <MetricCard title="Sessions" value={metrics.sessions || 0} />
      <MetricCard title="Attempts" value={attempts} />
      
      <MetricCard title="Calendar Reached" value={calendarReached} />
      <MetricCard title="Dates Avail." value={datesAvailable} />
      <MetricCard title="No Dates" value={noDates} />
      <MetricCard title="No Date Rate" value={noDateRate} />
      
      <MetricCard title="Slots Avail." value={slotsAvailable} />
      <MetricCard title="No Slots" value={noSlots} />
      <MetricCard title="No Slot Rate" value={noSlotRate} />
      
      <MetricCard title="OTP Pages" value={otpPages} />
      <MetricCard title="OTP Success" value={otpSuccess} />
      <MetricCard title="OTP Conv." value={otpPageConversion} />
      
      <MetricCard title="Bookings" value={confirmed} highlight="text-green-600" />
      <MetricCard title="Booking Conv." value={bookingConversion} />
      <MetricCard title="Overall Conv." value={conversionRate} highlight="text-blue-600" />
      
      <MetricCard title="Errors" value={errors} highlight="text-red-600" />
      <MetricCard title="Retries" value={retries} />
    </div>
  );
}

function MetricCard({ title, value, highlight = 'text-gray-900' }: { title: string, value: number | string, highlight?: string }) {
  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col justify-between h-full">
      <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{title}</div>
      <div className={`text-2xl font-bold ${highlight}`}>{value}</div>
    </div>
  );
}
