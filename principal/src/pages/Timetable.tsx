import { useQuery } from '@tanstack/react-query';
import { Page, Table, Badge, Empty, api } from '../services/api';

const DAY_ORDER = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

export default function Timetable() {
  const { data, isLoading } = useQuery({ queryKey: ['school-timetable'], queryFn: () => api<any>('/timetable') });
  const list = (data?.data || []).slice().sort((a: any, b: any) => {
    const d = DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day);
    return d !== 0 ? d : String(a.startTime).localeCompare(String(b.startTime));
  });
  const rows = list.map((t: any) => [
    t.day, `${t.startTime}–${t.endTime}`,
    t.section?.class?.name ? `${t.section.class.name}-${t.section?.name || ''}` : t.sectionId,
    t.subject?.name || '—',
    t.teacher ? `${t.teacher.firstName} ${t.teacher.lastName}` : t.teacherId,
  ]);

  return (
    <Page title="Timetable" subtitle="School timetable across classes">
      <div style={{ display: 'flex', gap: 8 }}>
        {DAY_ORDER.map((d) => <Badge key={d} tone="slate">{d}</Badge>)}
      </div>
      <div style={{ marginTop: 16 }}>
        {isLoading ? <p>Loading…</p> : list.length === 0 ? <Empty title="No timetable entries" /> : (
          <Table headers={['Day', 'Time', 'Class-Section', 'Subject', 'Teacher']} rows={rows} />
        )}
      </div>
    </Page>
  );
}