import { Page, Empty } from '../services/api';
import { useChildren } from '../lib/ChildContext';
import { ChildPicker } from '../components/ChildPicker';

export default function Attendance() {
  const { children, child, setChild } = useChildren();
  const active = children.find((c) => c.student.id === child?.student.id) || child;
  const att = active?.student.attendance || [];
  const pct = att.length ? Math.round((att.filter((a: any) => a.status === 'PRESENT').length / att.length) * 100) : 0;
  return (
    <Page title="Attendance" subtitle="Your ward's attendance record">
      <ChildPicker children={children} active={active} onSelect={setChild} />
      {att.length === 0 ? <Empty title="No attendance records yet" /> : (
        <div className="saa-card">
          <p>Overall attendance: <b>{pct}%</b> ({att.length} records)</p>
        </div>
      )}
    </Page>
  );
}