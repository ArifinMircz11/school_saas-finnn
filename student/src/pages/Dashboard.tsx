import { useQuery } from '@tanstack/react-query';
import { Page, Stat, Empty, api, getUser } from '../services/api';

export default function Dashboard() {
  const user = getUser();
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => api<any>('/dashboard') });
  const d = data?.data?.data;
  const fees = d?.fees || [];
  const pendingFees = fees.reduce((s: number, f: any) => s + (Number(f.totalAmount) - Number(f.paidAmount)), 0);
  return (
    <Page title={`Hello, ${user?.firstName}`} subtitle="Your academic overview">
      {isLoading ? <p>Loading…</p> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16 }}>
        <Stat label="Attendance" value={(d?.attendancePct ?? 0) + '%'} />
        <Stat label="Pending Homework" value={d?.homeworkPending ?? 0} />
        <Stat label="Pending Fees" value={'₹' + Math.round(pendingFees)} />
      </div>
      {d?.student ? (
        <div className="saa-card" style={{ marginTop: 20 }}>
          <h3>{d.student.firstName} {d.student.lastName}</h3>
          <p style={{ color: '#6b7280' }}>{d.student.class?.name} {d.student.section?.name} · {d.student.admissionNo}</p>
        </div>
      ) : null}
      {!d && !isLoading ? <Empty title="No data" /> : null}
    </Page>
  );
}