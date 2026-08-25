import { Page, Table, Empty } from '../services/api';
import { useChildren } from '../lib/ChildContext';

export default function Children() {
  const { children } = useChildren();
  return (
    <Page title="My Children" subtitle="Profiles of your wards">
      {children.length === 0 ? <Empty title="No children linked" /> : (
        <div className="saa-card"><Table headers={['Admission', 'Name', 'Class', 'Section']} rows={children.map((c) => [c.student.admissionNo, `${c.student.firstName} ${c.student.lastName}`, c.student.class?.name || '—', c.student.section?.name || '—'])} /></div>
      )}
    </Page>
  );
}