import { useQuery } from '@tanstack/react-query';
import { Page, Table, Empty, api } from '../services/api';

export default function MyClasses() {
  const { data: classes } = useQuery({ queryKey: ['classes'], queryFn: () => api<any[]>('/academic/classes') });
  const list = (classes?.success ? classes.data : []) || [];
  return (
    <Page title="My Classes" subtitle="School sections">
      {list.length === 0 ? <Empty title="No classes yet" /> : (
        <div className="saa-card"><Table headers={['Class', 'Sections', 'Students']} rows={list.map((c: any) => [c.name, (c.sections || []).map((s: any) => s.name).join(', ') || '—', c._count?.students ?? 0])} /></div>
      )}
    </Page>
  );
}