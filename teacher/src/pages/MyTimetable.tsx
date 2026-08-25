import { useQuery } from '@tanstack/react-query';
import { Page, Table, Empty, api } from '../services/api';

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

export default function MyTimetable() {
  const { data } = useQuery({ queryKey: ['timetable'], queryFn: () => api<any>('/timetable') });
  const entries = (data?.data?.entries || []) as any[];
  const grouped = data?.data?.grouped || {};
  return (
    <Page title="My Timetable" subtitle="Your weekly schedule">
      {entries.length === 0 ? <Empty title="No timetable entries" /> : (
        DAYS.filter((d) => (grouped[d] || []).length).map((d) => (
          <div key={d} className="saa-card" style={{ marginBottom: 12, padding: 14 }}>
            <b style={{ color: '#4f46e5' }}>{d}</b>
            <Table headers={['Time', 'Subject', 'Section']} rows={(grouped[d] || []).map((e: any) => [`${e.startTime}–${e.endTime}`, e.subject?.name, `${e.section?.class?.name}-${e.section?.name}`])} />
          </div>
        ))
      )}
    </Page>
  );
}