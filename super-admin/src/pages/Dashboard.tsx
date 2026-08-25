import { useQuery } from '@tanstack/react-query';
import { Stat, Page, Empty, api } from '../services/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface AnalyticsData {
  counts: Record<string, number>;
  schoolGrowth: { month: string; count: number }[];
  planDistribution: { name: string; count: number }[];
}

const COLORS = ['#4f46e5', '#0ea5e9', '#16a34a', '#d97706', '#dc2626'];

export default function Dashboard() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => api<AnalyticsData>('/analytics'),
  });
  const counts = data?.success ? data.data.counts : null;

  return (
    <Page title="Platform Dashboard" subtitle="High-level SaaS overview across all schools">
      {isLoading ? <p>Loading…</p> : null}
      {counts ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 16 }}>
          <StatBox label="Total Schools" value={counts.totalSchools} />
          <StatBox label="Active Schools" value={counts.activeSchools} />
          <StatBox label="Trial / Pending" value={counts.trialSchools} />
          <StatBox label="Suspended" value={counts.suspendedSchools} />
          <StatBox label="Total Students" value={counts.totalStudents} />
          <StatBox label="Total Teachers" value={counts.totalTeachers} />
          <StatBox label="Total Parents" value={counts.totalParents} />
          <StatBox label="Active Subscriptions" value={counts.activeSubscriptions} />
          <StatBox label="Monthly Revenue" value={'₹' + (counts.monthlyRevenue || 0).toLocaleString('en-IN')} />
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16, marginTop: 24 }}>
        <div className="saa-card">
          <h3>School Growth (6 months)</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data?.data?.schoolGrowth || []}>
              <XAxis dataKey="month" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill={COLORS[0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="saa-card">
          <h3>Plan Distribution</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={data?.data?.planDistribution || []} dataKey="count" nameKey="name" outerRadius={90} label>
                {COLORS.map((c) => <Cell key={c} fill={c} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      {!counts && !isLoading ? <Empty title="No data yet" subtitle="Check your API connection." /> : null}
      {error ? <p style={{ color: 'red' }}>{String(error)}</p> : null}
    </Page>
  );
}

function StatBox({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="saa-stat">
      <span className="label">{label}</span>
      <span className="value">{value ?? 0}</span>
    </div>
  );
}