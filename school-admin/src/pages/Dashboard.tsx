import { useQuery } from '@tanstack/react-query';
import { Page, Stat, Empty, api } from '../services/api';

export default function Dashboard() {
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: () => api<any>('/dashboard') });
  const d = data?.data?.data;
  return (
    <Page title="Dashboard" subtitle="Daily overview for your school">
      {isLoading ? <p>Loading…</p> : null}
      {isError ? (
        <div className="saa-card" style={{ borderLeft: '4px solid #ef4444', marginBottom: 16 }}>
          <b style={{ color: '#ef4444' }}>Failed to load dashboard data</b>
          <p style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>{(error as any)?.message || 'An error occurred while connecting to the server.'}</p>
          <button onClick={() => refetch()} style={{ marginTop: 10, padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', cursor: 'pointer' }}>Retry</button>
        </div>
      ) : null}
      {d ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px,1fr))', gap: 16 }}>
          <Stat label="Total Students" value={d.totalStudents ?? 0} />
          <Stat label="Total Teachers" value={d.totalTeachers ?? 0} />
          <Stat label="Total Parents" value={d.totalParents ?? 0} />
          <Stat label="Today's Attendance" value={d.todayAttendance ?? 0} />
          <Stat label="Today's Fee Collection" value={'₹' + (d.todayFeeCollection ?? 0)} />
          <Stat label="Pending Fees" value={'₹' + Math.round(d.pendingFeesAmount ?? 0)} />
          <Stat label="New Admissions" value={d.newAdmissions ?? 0} />
          <Stat label="Pending Documents" value={d.pendingDocuments ?? 0} />
        </div>
      ) : null}
      {!d && !isLoading && !isError ? <Empty title="No data" subtitle="Ensure the school is set up." /> : null}
    </Page>
  );
}