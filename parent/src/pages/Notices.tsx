import { useQuery } from '@tanstack/react-query';
import { Page, Table, Empty, api, formats } from '../services/api';

export default function Notices() {
  const { data } = useQuery({ queryKey: ['notices'], queryFn: () => api<any[]>('/notices') });
  const list = (data?.success ? data.data : []) || [];
  return (
    <Page title="Notices" subtitle="School announcements">
      {list.length === 0 ? <Empty title="No notices" /> : <div className="saa-card"><Table headers={['Title', 'Content', 'Posted']} rows={list.map((n: any) => [n.title, n.content, formats.date(n.createdAt)])} /></div>}
    </Page>
  );
}