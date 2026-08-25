import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, BarChart, Bar, PieChart, Pie, Cell, Legend, ResponsiveContainer } from 'recharts';
import { Page, Stat, Empty, api } from '../services/api';

const COLORS = ['#7c3aed', '#4f46e5', '#0ea5e9', '#16a34a', '#d97706', '#dc2626'];

export default function Analytics() {
  const { data, isLoading } = useQuery({ queryKey: ['principal-analytics'], queryFn: () => api<any>('/principal/analytics') });
  const d = data?.data;
  const admissionStatus = Object.entries(d?.admissionStatus || {}).map(([name, count]) => ({ name, count }));

  return (
    <Page title="Analytics" subtitle="School trends — students, admissions and revenue">
      {isLoading ? <p>Loading…</p> : d ? (
        <>
          <Stat label="Avg Attendance" value={`${d.attendancePct ?? 0}%`} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            <div className="saa-card">
              <h3 style={{ marginTop: 0 }}>Student Growth (6 months)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={d.studentGrowth || []}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" name="Students" stroke="#7c3aed" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="saa-card">
              <h3 style={{ marginTop: 0 }}>Revenue Trend</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={d.revenueTrend || []}>
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="amount" name="Collected" fill="#16a34a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="saa-card" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>Admissions by Status</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={admissionStatus} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={70} label>
                  {admissionStatus.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend /><Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : <Empty title="No analytics data" />}
    </Page>
  );
}