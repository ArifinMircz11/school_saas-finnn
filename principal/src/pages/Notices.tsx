import { useQuery } from '@tanstack/react-query';
import { Page, Badge, Empty, api, formats } from '../services/api';

export default function Notices() {
  const { data, isLoading } = useQuery({ queryKey: ['notices'], queryFn: () => api<any>('/notices') });
  const notices = data?.data || [];

  return (
    <Page title="Notices" subtitle="School notices">
      {isLoading ? <p>Loading…</p> : notices.length === 0 ? <Empty title="No notices" /> : (
        <div style={{ display: 'grid', gap: 12 }}>
          {notices.map((n: any) => (
            <div className="saa-card" key={n.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b>{n.title}</b>
                <Badge tone={n.audience === 'ALL' ? 'slate' : 'amber'}>{n.audience}</Badge>
              </div>
              <p style={{ margin: '8px 0 4px', color: '#111827' }}>{n.content}</p>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{formats.date(n.createdAt)}</div>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}