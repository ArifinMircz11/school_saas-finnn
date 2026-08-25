import { useQuery } from '@tanstack/react-query';
import { Page, Stat, Empty, api } from '../services/api';

export default function Dashboard() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: () => api<any>('/dashboard') });
  const d = data?.data?.data;
  return (
    <Page title="Teacher Dashboard" subtitle="Your classes, students and tasks today">
      {isLoading ? <p>Loading…</p> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px,1fr))', gap: 16 }}>
        <Stat label="Today's Classes" value={d?.todayClasses ?? 0} />
        <Stat label="Total Students" value={d?.totalStudents ?? 0} />
        <Stat label="Homework Assigned" value={d?.pendingHomework ?? 0} />
      </div>
      {d?.teacher ? (
        <div className="saa-card" style={{ marginTop: 20 }}>
          <b>{d.teacher.firstName} {d.teacher.lastName}</b>
          <div style={{ fontSize: 14, color: '#6b7280' }}>
            Sections: {(d.teacher.sections || []).map((s: any) => s.section?.name).join(', ') || 'none'} | Subjects: {(d.teacher.subjects || []).map((s: any) => s.subject?.name).join(', ') || 'none'}
          </div>
        </div>
      ) : null}
      {!d && !isLoading ? <Empty title="No data" /> : null}
    </Page>
  );
}