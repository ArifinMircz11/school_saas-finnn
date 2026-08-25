import { useQuery } from '@tanstack/react-query';
import { Page, Table, Badge, Empty, api, formats } from '../services/api';

export default function Homework() {
  const { data, isLoading } = useQuery({ queryKey: ['principal-homework'], queryFn: () => api<any>('/principal/homework') });
  const list = data?.data || [];
  const rows = list.map((h: any) => [
    h.title, h.subject, h.section, formats.date(h.dueDate), h.submissions,
    h.published ? <Badge tone="green">Published</Badge> : <Badge tone="amber">Draft</Badge>,
  ]);

  return (
    <Page title="Homework" subtitle="Monitor homework activity across the school">
      {isLoading ? <p>Loading…</p> : list.length === 0 ? <Empty title="No homework" /> : (
        <Table headers={['Title', 'Subject', 'Section', 'Due', 'Submissions', 'Status']} rows={rows} />
      )}
    </Page>
  );
}