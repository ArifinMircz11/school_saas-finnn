import { useQuery } from '@tanstack/react-query';
import { Page, Empty, api, formats } from '../services/api';

export default function Notifications() {
  const { data } = useQuery({ queryKey: ['notifications'], queryFn: () => api<any[]>('/notifications') });
  const list = (data?.success ? data.data : []) || [];
  return (
    <Page title="Notifications" subtitle="In-app notification center">
      {list.length === 0 ? <Empty title="No notifications yet" /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map((n: any) => (
            <div key={n.id} className="saa-card" style={{ padding: 14, opacity: n.read ? 0.7 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <b>{n.title}</b><span style={{ fontSize: 12, color: '#6b7280' }}>{formats.date(n.createdAt)}</span>
              </div>
              <div style={{ fontSize: 14 }}>{n.message}</div>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}