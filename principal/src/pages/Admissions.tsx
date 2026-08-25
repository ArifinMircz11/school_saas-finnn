import { useQuery } from '@tanstack/react-query';
import { Page, Table, Badge, Stat, Btn, Empty, api, toast, formats } from '../services/api';

export default function Admissions() {
  const { data, isLoading, refetch } = useQuery({ queryKey: ['principal-admissions'], queryFn: () => api<any>('/principal/admissions') });
  const d = data?.data;
  const counts = d?.counts || {};
  const list = d?.list || [];

  const act = async (id: string, status: string) => {
    const r = await api(`/admissions/${id}/review`, { method: 'POST', body: { status } });
    toast(r.success ? `Admission ${status.toLowerCase()}` : (r.message || 'Failed'));
    if (r.success) refetch();
  };

  const rows = list.map((a: any) => [
    a.applicationNo, `${a.firstName} ${a.lastName}`, a.class?.name || '—', formats.date(a.createdAt),
    <Badge tone={a.status === 'APPROVED' || a.status === 'CONVERTED' ? 'green' : a.status === 'REJECTED' ? 'red' : a.status === 'PENDING' || a.status === 'SUBMITTED' ? 'amber' : 'slate'}>{a.status}</Badge>,
    a.status === 'PENDING' || a.status === 'SUBMITTED' ? (
      <div style={{ display: 'flex', gap: 6 }}>
        <Btn onClick={() => act(a.id, 'APPROVED')}>Approve</Btn>
        <Btn variant="secondary" onClick={() => act(a.id, 'REJECTED')}>Reject</Btn>
      </div>
    ) : '—',
  ]);

  return (
    <Page title="Admissions" subtitle="Admission monitoring and approval workflow">
      {isLoading ? <p>Loading…</p> : null}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 12 }}>
        <Stat label="Total" value={counts.total ?? 0} />
        <Stat label="Pending" value={counts.PENDING ?? 0} />
        <Stat label="Approved" value={(counts.APPROVED ?? 0) + (counts.CONVERTED ?? 0)} />
        <Stat label="Rejected" value={counts.REJECTED ?? 0} />
        <Stat label="Waitlisted" value={counts.WAITLISTED ?? 0} />
      </div>
      {isLoading ? null : list.length === 0 ? <div style={{ marginTop: 20 }}><Empty title="No applications" /></div> : (
        <div style={{ marginTop: 20 }}><Table headers={['App No', 'Applicant', 'Class', 'Applied', 'Status', 'Actions']} rows={rows} /></div>
      )}
    </Page>
  );
}