import { useQuery } from '@tanstack/react-query';
import { Page, Stat, Empty, api } from '../services/api';

export default function Dashboard() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => api<any>('/dashboard') });
  const d = data?.data?.data;
  return (
    <Page title="Dashboard" subtitle="Daily overview for your school">
      {isLoading ? <p>Loading…</p> : null}
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
      {!d && !isLoading ? <Empty title="No data" subtitle="Ensure the school is set up." /> : null}
    </Page>
  );
}