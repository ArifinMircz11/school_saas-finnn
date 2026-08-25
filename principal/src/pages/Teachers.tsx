import { useQuery } from '@tanstack/react-query';
import { Page, Table, Badge, api } from '../services/api';

export default function Teachers() {
  const { data, isLoading } = useQuery({ queryKey: ['principal-teachers'], queryFn: () => api<any>('/principal/teachers') });
  const teachers = data?.data || [];
  const rows = teachers.map((t: any) => [
    `${t.firstName} ${t.lastName}`,
    t.empCode,
    t.designation || '—',
    t.classes || '—',
    t.subjects || '—',
    t.assignedStudents,
    t.homeworkPosted,
    t.marksEntered,
    <Badge tone={t.workloadScore > 6 ? 'amber' : 'green'}>{t.workloadScore}</Badge>,
  ]);

  return (
    <Page title="Teacher Performance" subtitle="Workload, activity and marks submission">
      {isLoading ? <p>Loading…</p> : teachers.length === 0 ? <p style={{ color: '#6b7280' }}>No teachers found.</p> : (
        <Table headers={['Name', 'Emp Code', 'Designation', 'Classes', 'Subjects', 'Students', 'Homework', 'Marks', 'Workload']} rows={rows} />
      )}
    </Page>
  );
}