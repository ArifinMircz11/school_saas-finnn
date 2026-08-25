import { useQuery } from '@tanstack/react-query';
import { Page, Table, Empty, api, formats } from '../services/api';

export default function Homework() {
  const { data } = useQuery({ queryKey: ['homework'], queryFn: () => api<any[]>('/homework') });
  const list = (data?.success ? data.data : []) || [];
  return (
    <Page title="Homework" subtitle="Homework assigned to your ward's class">
      {list.length === 0 ? <Empty title="No homework assigned" /> : (
        <div className="saa-card"><Table headers={['Title', 'Subject', 'Due', 'Status']} rows={list.map((h: any) => [h.title, h.subject?.name, formats.date(h.dueDate), '—'])} /></div>
      )}
    </Page>
  );
}