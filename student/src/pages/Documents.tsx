import { useQuery } from '@tanstack/react-query';
import { Page, Table, Empty, api } from '../services/api';

export default function Documents() {
  const { data } = useQuery({ queryKey: ['documents'], queryFn: () => api<any[]>('/documents') });
  const list = (data?.success ? data.data : []) || [];
  return (
    <Page title="Documents" subtitle="Documents available to you">
      {list.length === 0 ? <Empty title="No documents" /> : (
        <div className="saa-card"><Table headers={['Title', 'Type', 'View']} rows={list.map((d: any) => [d.title, d.type, <a key={'d' + d.id} href={d.url} style={{ fontSize: 14 }}>↗</a>])} /></div>
      )}
    </Page>
  );
}