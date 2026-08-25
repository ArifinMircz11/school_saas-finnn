import { useQuery } from '@tanstack/react-query';
import { Page, Table, Empty, api, formats } from '../services/api';

export default function Fees() {
  const { data } = useQuery({ queryKey: ['fees'], queryFn: () => api<any[]>('/fees/students') });
  const list = (data?.success ? data.data : []) || [];
  return (
    <Page title="Fees" subtitle="Your fee status">
      {list.length === 0 ? <Empty title="No fee records" /> : (
        <div className="saa-card"><Table headers={['Structure', 'Total', 'Paid', 'Due', 'Status']} rows={list.map((f: any) => [f.structure?.name, formats.money(f.totalAmount), formats.money(f.paidAmount), formats.money(Number(f.totalAmount) - Number(f.paidAmount) - Number(f.discount || 0)), f.status])} /></div>
      )}
    </Page>
  );
}