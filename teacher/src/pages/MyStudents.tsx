import { useQuery } from '@tanstack/react-query';
import { Page, Table, Empty, api } from '../services/api';

export default function MyStudents() {
  const { data: students } = useQuery({ queryKey: ['students'], queryFn: () => api<any[]>('/students') });
  const list = (students?.success ? students.data : []) || [];
  return (
    <Page title="My Students" subtitle="Students in your assigned sections">
      {list.length === 0 ? <Empty title="No students assigned" /> : (
        <div className="saa-card"><Table headers={['Admission', 'Name', 'Class', 'Section']} rows={list.map((s: any) => [s.admissionNo, `${s.firstName} ${s.lastName}`, s.class?.name || '—', s.section?.name || '—'])} /></div>
      )}
    </Page>
  );
}