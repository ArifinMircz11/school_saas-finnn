import { useQuery } from '@tanstack/react-query';
import { Page, Stat, api } from '../services/api';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

export default function Analytics() {
  const { data } = useQuery({ queryKey: ['analytics'], queryFn: () => api<any>('/analytics') });
  const a = data?.data;
  return (
    <Page title="Platform Analytics" subtitle="Growth and revenue trends">
      {a?.studentGrowth ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px,1fr))', gap: 16 }}>
          <div className="saa-card">
            <h3>Student Growth</h3>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={(a.studentGrowth || []).map((v: number, i: number) => ({ month: 'M' + (i + 1), value: v }))}>
                <XAxis dataKey="month" /><YAxis /><Tooltip /><Line dataKey="value" stroke="#4f46e5" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="saa-card">
            <h3>Revenue Growth</h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={(a.revenueGrowth || []).map((v: number, i: number) => ({ month: 'M' + (i + 1), value: v }))}>
                <XAxis dataKey="month" /><YAxis /><Tooltip /><Bar dataKey="value" fill="#16a34a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : <p>Loading analytics…</p>}
    </Page>
  );
}