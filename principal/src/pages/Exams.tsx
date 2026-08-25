import { useQuery } from '@tanstack/react-query';
import { Page, Badge, Empty, api, formats } from '../services/api';

export default function Exams() {
  const { data, isLoading } = useQuery({ queryKey: ['principal-exams'], queryFn: () => api<any>('/principal/exams') });
  const exams = data?.data || [];
  const bar = (pct: number, color: string) => (
    <div style={{ height: 8, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99 }} />
    </div>
  );

  return (
    <Page title="Examinations" subtitle="Marks submission and result publication status">
      {isLoading ? <p>Loading…</p> : exams.length === 0 ? <Empty title="No exams yet" /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px,1fr))', gap: 16 }}>
          {exams.map((e: any) => (
            <div className="saa-card" key={e.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <b>{e.name}</b>
                {e.resultsPublishedPct >= 100 ? <Badge tone="green">Published</Badge> : e.pending > 0 ? <Badge tone="amber">In progress</Badge> : <Badge tone="slate">Upcoming</Badge>}
              </div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>{e.session} · {formats.date(e.startDate)} — {formats.date(e.endDate)}</div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>{e.subjects?.map((s: any) => s.name).join(', ') || 'No subjects'}</div>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Results published</div>
                {bar(e.resultsPublishedPct, e.resultsPublishedPct >= 100 ? '#16a34a' : '#d97706')}
                <div style={{ fontSize: 12, marginTop: 4 }}>{e.resultsPublishedPct}% published · {e.pending} pending</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}