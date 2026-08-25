import { useQuery } from '@tanstack/react-query';
import { Page, Table, Empty, Badge, api } from '../services/api';

export default function Invoices() {
  const { data } = useQuery({ queryKey: ['invoices'], queryFn: () => api<any[]>('/invoices') });
  const invoices = (data?.success ? data.data : []) || [];
  const tone = (s: string) => (s === 'PAID' ? 'green' : s === 'PENDING' ? 'amber' : 'slate') as 'green' | 'amber' | 'slate';
  return (
    <Page title="Invoices" subtitle="Subscription billing records">
      {invoices.length === 0 ? <p>No invoices.</p> : (
        <div className="saa-card">
          <Table headers={['Invoice', 'School', 'Plan', 'Amount', 'Status', 'Due']}
            rows={invoices.map((i: any) => [String(i.id).slice(0, 8), i.school?.name, i.subscription?.plan?.name || '—', '₹' + i.amount, <Badge key={'b' + i.id} tone={tone(i.status)}>{i.status}</Badge>, i.dueDate || '—'])} />
        </div>
      )}
    </Page>
  );
}