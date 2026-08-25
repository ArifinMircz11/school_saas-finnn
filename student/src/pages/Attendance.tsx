import { useQuery } from '@tanstack/react-query';
import { Page, Empty, api } from '../services/api';

export default function Attendance() {
  const { data } = useQuery({ queryKey: ['attendance-summary'], queryFn: () => api<any>('/attendance/summary') });
  const d = data?.data;
  return (
    <Page title="Attendance" subtitle="Your attendance record">
      {d ? (
        <div className="saa-card" style={{ maxWidth: 480 }}>
          <p><b>Attendance:</b> {d.percent ?? 0}%</p>
          <p>Present: {d.present ?? 0} of {d.total ?? 0} records</p>
          <p>Absences: {d.absents ?? 0}</p>
        </div>
      ) : <Empty title="Loading" />}
    </Page>
  );
}