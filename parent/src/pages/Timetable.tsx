import { useQuery } from '@tanstack/react-query';
import { Page, Table, Empty, api } from '../services/api';
import { useChildren } from '../lib/ChildContext';

export default function Timetable() {
  const { child } = useChildren();
  const studentId = child?.student.id;
  const { data } = useQuery({ queryKey: ['timetable', studentId], queryFn: () => api<any>(`/timetable${studentId ? '?studentId=' + studentId : ''}`) });
  const entries = (data?.data?.entries || []) as any[];
  return (
    <Page title="Timetable" subtitle="Your ward's class schedule">
      {entries.length === 0 ? <Empty title="No timetable yet" /> : (
        <div className="saa-card"><Table headers={['Day', 'Time', 'Subject', 'Section']} rows={entries.slice(0, 100).map((e: any) => [e.day, `${e.startTime}–${e.endTime}`, e.subject?.name, `${e.section?.class?.name}-${e.section?.name}`])} /></div>
      )}
    </Page>
  );
}