import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Page, Stat, Table, Empty, api } from '../services/api';

export default function Attendance() {
  const { data, isLoading } = useQuery({ queryKey: ['principal-attendance'], queryFn: () => api<any>('/principal/attendance/analytics') });
  const d = data?.data;
  const classRows = (d?.classWise || []).map((c: any) => [c.name, c.total, c.present, `${c.pct}%`]);
  const lowRows = (d?.lowAttendance || []).map((l: any, i: number) => [`${i + 1}. ${l.className}`, `${l.pct}%`]);

  return (
    <Page title="Attendance Analytics" subtitle="School-wide attendance monitoring">
      {isLoading ? <p>Loading…</p> : d ? (
        <>
          <Stat label="Today's Attendance" value={`${d.todayPct}%`} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            <div className="saa-card">
              <h3 style={{ marginTop: 0 }}>Class-wise (today)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={d.classWise || []}>
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="pct" name="Attendance %" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="saa-card">
              <h3 style={{ marginTop: 0 }}>Monthly trend (30 days)</h3>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={d.trend || []}>
                  <XAxis dataKey="day" tick={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="pct" name="Attendance %" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
            <div className="saa-card">
              <h3 style={{ marginTop: 0 }}>Class-wise Attendance</h3>
              {d.classWise?.length ? <Table headers={['Class', 'Total', 'Present', '%']} rows={classRows} /> : <p style={{ color: '#6b7280' }}>No attendance marked today.</p>}
            </div>
            <div className="saa-card">
              <h3 style={{ marginTop: 0 }}>Low Attendance (&lt;75%)</h3>
              {d.lowAttendance?.length ? <Table headers={['Class', 'Attendance']} rows={lowRows} /> : <p style={{ color: '#6b7280' }}>All classes above 75%.</p>}
            </div>
          </div>
        </>
      ) : <Empty title="No attendance data" />}
    </Page>
  );
}