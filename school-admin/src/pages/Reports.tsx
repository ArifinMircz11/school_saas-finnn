import { useQuery } from '@tanstack/react-query';
import { Page, Table, Empty, api, formats } from '../services/api';

export default function ReportsPage() {
  const { data } = useQuery({ queryKey: ['reports'], queryFn: () => api<any>('/reports') });
  const r = data?.data;
  return (
    <Page title="Reports" subtitle="Student, fee and attendance summaries">
      {r ? (
        <>
          <div className="saa-card" style={{ marginBottom: 16 }}>
            <b>Students:</b> {r.students?.total || 0} total
            <div style={{ fontSize: 13, color: '#6b7280' }}>By class: {Object.entries(r.students?.byClass || {}).map(([k, v]) => `${k} (${(v as any[]).length})`).join(', ') || 'none'}</div>
          </div>
          <div className="saa-card" style={{ marginBottom: 16 }}>
            <b>Fees:</b> Daily collection ₹{r.fees?.dailyCollection || 0}, Pending records {r.fees?.pendingFees || 0}
          </div>
          <div className="saa-card">
            <b>Attendance:</b> {r.attendance?.totalRecords || 0} records, {r.attendance?.dailyPercent || 0}% present (period)
          </div>
        </>
      ) : <p>Loading…</p>}
    </Page>
  );
}