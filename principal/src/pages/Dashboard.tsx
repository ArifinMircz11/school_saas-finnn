import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Page, Stat, Empty, api, formats } from '../services/api';

export default function Dashboard() {
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['principal-overview'], queryFn: () => api<any>('/principal/overview') });
  const d = data?.data;
  const c = d?.counts || {};

  return (
    <Page title="Principal Dashboard" subtitle="Executive overview of your school">
      {isLoading ? <p>Loading…</p> : null}
      {isError ? (
        <div className="saa-card" style={{ borderLeft: '4px solid #ef4444', marginBottom: 16 }}>
          <b style={{ color: '#ef4444' }}>Failed to load principal overview</b>
          <p style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>{(error as any)?.message || 'An error occurred while connecting to the server.'}</p>
          <button onClick={() => refetch()} style={{ marginTop: 10, padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', cursor: 'pointer' }}>Retry</button>
        </div>
      ) : null}
      {d ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px,1fr))', gap: 16 }}>
            <Stat label="Total Students" value={c.totalStudents ?? 0} />
            <Stat label="Total Teachers" value={c.totalTeachers ?? 0} />
            <Stat label="Classes" value={c.totalClasses ?? 0} />
            <Stat label="Today's Attendance" value={`${c.todayAttendancePct ?? 0}%`} hint={`${c.todaysAttendance ?? 0} marked`} />
            <Stat label="Avg Attendance" value={`${c.averageAttendancePct ?? 0}%`} hint={`${c.weeklyAttendancePct ?? 0}% this week`} />
            <Stat label="Pending Admissions" value={c.pendingAdmissions ?? 0} />
            <Stat label="Pending Approvals" value={c.pendingApprovals ?? 0} />
            <Stat label="Upcoming Exams" value={c.upcomingExams ?? 0} />
            <Stat label="Overdue Fee Rows" value={c.overdueFees ?? 0} />
          </div>

          <div className="saa-card" style={{ marginTop: 20 }}>
            <h3 style={{ marginTop: 0 }}>Today's Fee Collection</h3>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{formats.money(d?.fees?.todayCollection)}</div>
            <div style={{ color: '#6b7280', fontSize: 13 }}>This month {formats.money(d?.fees?.monthCollection)} · Pending {formats.money(d?.fees?.pendingAmount)}</div>
          </div>

          <div className="saa-card" style={{ marginTop: 20 }}>
            <h3 style={{ marginTop: 0 }}>Attendance Trend (last 7 days)</h3>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={d?.attendanceTrend || []}>
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="pct" name="Attendance %" stroke="#7c3aed" fill="url(#g)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      ) : null}

      {!d && !isLoading && !isError ? <Empty title="No data" subtitle="Overview will populate once your school has data." /> : null}
    </Page>
  );
}