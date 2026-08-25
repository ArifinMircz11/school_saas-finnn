import { useQuery } from '@tanstack/react-query';
import { Page, Table, Empty, api } from '../services/api';

export default function Staff() {
  const { data } = useQuery({ queryKey: ['staff'], queryFn: () => api<any[]>('/staff') });
  const list = (data?.success ? data.data : []) || [];
  return (
    <Page title="Staff" subtitle="Non-teaching staff records">
      {list.length === 0 ? <Empty title="No staff records" /> : (
        <div className="saa-card"><Table headers={['Code', 'Name', 'Role']} rows={list.map((s: any) => [s.empCode, `${s.firstName} ${s.lastName}`, s.role])} /></div>
      )}
    </Page>
  );
}