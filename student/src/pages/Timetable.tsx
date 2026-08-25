import { useQuery } from '@tanstack/react-query';
import { Page, Table, Empty, api } from '../services/api';

export default function Timetable() {
  const { data } = useQuery({ queryKey: ['timetable'], queryFn: () => api<any>('/timetable') });
  const entries = (data?.data?.entries || []) as any[];
  return (
    <Page title="Timetable" subtitle="Your weekly class schedule">
      {entries.length === 0 ? <Empty title="No timetable yet" /> : (
        <div className="saa-card"><Table headers={['Day', 'Time', 'Subject', 'Section']} rows={entries.map((e: any) => [e.day, `${e.startTime}–${e.endTime}`, e.subject?.name, `${e.section?.class?.name}-${e.section?.name}`])} /></div>
      )}
    </Page>
  );
}