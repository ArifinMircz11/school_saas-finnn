import { useQuery } from '@tanstack/react-query';
import { Page, Table, Stat, Badge, api } from '../services/api';

export default function Classes() {
  const { data, isLoading } = useQuery({ queryKey: ['academic-profile'], queryFn: () => api<any>('/academic/profile') });
  const ac = data?.data;
  const classes = ac?.classes || [];
  const sessions = ac?.sessions || [];
  const subjects = ac?.subjects || [];

  const rows = classes.map((c: any) => [
    c.name,
    (c.sections || []).map((s: any) => s.name).join(', ') || '—',
    c._count?.students ?? (c.sections || []).reduce((a: number, s: any) => a, 0),
  ]);

  return (
    <Page title="Classes & Sections" subtitle="Academic structure overview">
      {isLoading ? <p>Loading…</p> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12, marginBottom: 20 }}>
            <Stat label="Classes" value={classes.length} />
            <Stat label="Sections" value={classes.reduce((a: number, c: any) => a + (c.sections?.length || 0), 0)} />
            <Stat label="Subjects" value={subjects.length} />
          </div>
          {sessions.length ? <div style={{ marginBottom: 12 }}>
            <b>Academic Session: </b>{sessions.find((s: any) => s.isActive)?.name || sessions[0]?.name || '—'}
          </div> : null}
          {classes.length === 0 ? <p style={{ color: '#6b7280' }}>No classes configured yet.</p> : (
            <Table headers={['Class', 'Sections', 'Active']} rows={rows} />
          )}
          {subjects.length ? (
            <div className="saa-card" style={{ marginTop: 20 }}>
              <h3 style={{ marginTop: 0 }}>Subjects</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {subjects.map((s: any) => <Badge key={s.id} tone="slate">{s.name}</Badge>)}
              </div>
            </div>
          ) : null}
        </>
      )}
    </Page>
  );
}