import { useQuery } from '@tanstack/react-query';
import { Page, Stat, Empty, api } from '../services/api';

export default function Dashboard() {
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['dashboard'], queryFn: () => api<any>('/dashboard') });
  const d = data?.data?.data;
  return (
    <Page title="Teacher Dashboard" subtitle="Your classes, students and tasks today">
      {isLoading ? <p>Loading…</p> : null}
      {isError ? (
        <div className="saa-card" style={{ borderLeft: '4px solid #ef4444', marginBottom: 16 }}>
          <b style={{ color: '#ef4444' }}>Failed to load teacher dashboard</b>
          <p style={{ color: '#6b7280', fontSize: 13, marginTop: 4 }}>{(error as any)?.message || 'An error occurred while connecting to the server.'}</p>
          <button onClick={() => refetch()} style={{ marginTop: 10, padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', cursor: 'pointer' }}>Retry</button>
        </div>
      ) : null}
      {d ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px,1fr))', gap: 16 }}>
            <Stat label="Today's Classes" value={d.todayClasses ?? 0} />
            <Stat label="Total Students" value={d.totalStudents ?? 0} />
            <Stat label="Homework Assigned" value={d.pendingHomework ?? 0} />
          </div>
          {d.teacher ? (
            <div className="saa-card" style={{ marginTop: 20 }}>
              <b>{d.teacher.firstName} {d.teacher.lastName}</b>
              <div style={{ fontSize: 14, color: '#6b7280' }}>
                Sections: {(d.teacher.sections || []).map((s: any) => s.section?.name).join(', ') || 'none'} | Subjects: {(d.teacher.subjects || []).map((s: any) => s.subject?.name).join(', ') || 'none'}
              </div>
            </div>
          ) : (
            <div className="saa-card" style={{ marginTop: 20, color: '#6b7280', fontSize: 14 }}>
              No teacher profile linked to this account yet.
            </div>
          )}
        </>
      ) : null}
      {!d && !isLoading && !isError ? <Empty title="No data" /> : null}
    </Page>
  );
}