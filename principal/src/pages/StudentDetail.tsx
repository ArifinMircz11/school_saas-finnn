import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Page, Table, Badge, Stat, Empty, api, formats } from '../services/api';

export default function StudentDetail() {
  const { id } = useParams();
  const { data, isLoading } = useQuery({ queryKey: ['principal-student', id], queryFn: () => api<any>(`/principal/students/${id}`) });
  const d = data?.data;
  const s = d?.student;
  const attRows = (d?.attendance?.recent || []).map((a: any) => [
    new Date(a.date).toLocaleDateString(),
    a.status === 'PRESENT' ? <Badge tone="green">PRESENT</Badge> : a.status === 'LATE' ? <Badge tone="amber">LATE</Badge> : <Badge tone="red">{a.status}</Badge>,
  ]);
  const resultRows = (d?.academic?.results || []).map((r: any) => [
    r.exam.name, r.examSubject.subject.name, `${r.marksObtained}/${r.examSubject.maxMarks}`,
    r.published ? <Badge tone="green">Published</Badge> : <Badge tone="amber">Draft</Badge>,
  ]);

  return (
    <Page title={s ? `${s.firstName} ${s.lastName}` : 'Student'} subtitle={s ? `${s.admissionNo} · ${s.className}${s.sectionName ? '-' + s.sectionName : ''}` : ''}>
      {isLoading ? <p>Loading…</p> : !s ? <Empty title="Student not found" /> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px,1fr))', gap: 12 }}>
            <Stat label="Attendance" value={`${d.attendance.pct}%`} hint={`${d.attendance.present}/${d.attendance.total} present`} />
            <Stat label="Academic Average" value={`${d.academic.avg}%`} />
            <Stat label="Pending Fees" value={formats.money((d.pendingFees || []).reduce((a: number, f: any) => a + f.due, 0))} />
            <Stat label="Parents" value={s.parents?.length || 0} />
          </div>

          <div className="saa-card" style={{ marginTop: 20 }}>
            <h3 style={{ marginTop: 0 }}>Pending Fees</h3>
            {d.pendingFees?.length === 0 ? <p style={{ color: '#6b7280' }}>Fees are clear.</p> : (
              <Table headers={['Fee', 'Total', 'Paid', 'Due', 'Due Date', 'Status']} rows={(d.pendingFees || []).map((f: any) => [
                f.name, formats.money(f.total), formats.money(f.paid), formats.money(f.due), formats.date(f.dueDate), <Badge tone="amber">{f.status}</Badge>,
              ])} />
            )}
          </div>

          <div className="saa-card" style={{ marginTop: 20 }}>
            <h3 style={{ marginTop: 0 }}>Recent Attendance</h3>
            <Table headers={['Date', 'Status']} rows={attRows} />
          </div>

          <div className="saa-card" style={{ marginTop: 20 }}>
            <h3 style={{ marginTop: 0 }}>Published Results</h3>
            {d.academic.results?.length === 0 ? <p style={{ color: '#6b7280' }}>No published results yet.</p> : <Table headers={['Exam', 'Subject', 'Marks', 'Status']} rows={resultRows} />}
          </div>
        </>
      )}
    </Page>
  );
}