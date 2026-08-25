import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Btn, Badge, Empty, api, toast, formats } from '../services/api';

export default function Notifications() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['notifications'], queryFn: () => api<any>('/notifications') });
  const notifs = list.data?.data || [];
  const markAll = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }); toast('All marked as read'); },
  });

  return (
    <Page title="Notifications" subtitle="Alerts, approvals and updates" actions={<Btn onClick={() => markAll.mutate()} disabled={markAll.isPending}>Mark all read</Btn>}>
      {list.isLoading ? <p>Loading…</p> : notifs.length === 0 ? <Empty title="No notifications" /> : (
        <div style={{ display: 'grid', gap: 10 }}>
          {notifs.map((n: any) => (
            <div className="saa-card" key={n.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <div><b>{n.title}</b> {n.read ? null : <Badge tone="amber">New</Badge>}</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>{n.message}</div>
                <div style={{ fontSize: 12, color: '#9ca3af' }}>{formats.date(n.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}