import { useQuery } from '@tanstack/react-query';
import { Page, Table, Empty, api, formats } from '../services/api';

export default function AuditLogs() {
  const { data } = useQuery({ queryKey: ['audit'], queryFn: () => api<any[]>('/audit-logs') });
  const logs = (data?.success ? data.data : []) || [];
  return (
    <Page title="Audit Logs" subtitle="Every sensitive operation, recorded">
      {logs.length === 0 ? <Empty title="No audit entries" /> : (
        <div className="saa-card">
          <Table headers={['Time', 'User (email)', 'Action', 'Module']}
            rows={logs.map((l: any) => [formats.date(l.createdAt) + ' ' + new Date(l.createdAt).toLocaleTimeString(), l.user?.email || 'system', l.action, l.module])} />
        </div>
      )}
    </Page>
  );
}