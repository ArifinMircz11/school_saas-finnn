import { Page, Table, Empty, formats } from '../services/api';
import { useChildren, ChildInfo } from '../lib/ChildContext';
import { ChildPicker } from '../components/ChildPicker';

export default function FeesPage() {
  const { children, child, setChild } = useChildren();
  const active = children.find((c) => c.student.id === child?.student.id) || child;
  const fees = active?.student.fees || [];
  return (
    <Page title="Fees" subtitle="Fee status and history for your ward">
      <ChildPicker children={children} active={active} onSelect={setChild} />
      {fees.length === 0 ? <Empty title="No fee records" subtitle="Fee details for your ward will appear here when assigned." /> : (
        <div className="saa-card">
          <Table headers={['Structure', 'Total', 'Paid', 'Due', 'Status']} rows={fees.map((f) => [f.structure?.name || '—', formats.money(f.totalAmount), formats.money(f.paidAmount), formats.money(Number(f.totalAmount) - Number(f.paidAmount) - Number(f.discount || 0)), '—'])} />
        </div>
      )}
    </Page>
  );
}