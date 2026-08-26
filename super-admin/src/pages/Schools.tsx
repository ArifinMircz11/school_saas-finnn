import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Table, Empty, Badge, Btn, api, toast } from '../services/api';
import { useLocation, useParams } from 'react-router-dom';

interface School { id: string; name: string; code: string; email?: string; status: string; city?: string; plan?: { name: string } | null; _count?: { students?: number; teachers?: number }; }

const statusTone: Record<string, 'green' | 'red' | 'amber' | 'slate'> = {
  ACTIVE: 'green', PENDING: 'amber', SUSPENDED: 'red', REJECTED: 'red', ARCHIVED: 'slate',
};

export const SchoolsByStatus = () => {
  const location = useLocation();
  const seg = location.pathname.split('/').filter(Boolean);
  const status = seg[1] ? seg[1].toUpperCase().replace('-', '') : undefined;

  const { data } = useQuery({ queryKey: ['schools', status], queryFn: () => api<School[]>(`/schools${status ? '?status=' + status : ''}`) });
  const schools = (data?.success ? data.data : []) || [];

  const qc = useQueryClient();
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) => api(`/schools/${v.id}/status`, { method: 'PATCH', body: { status: v.status } }),
    onSuccess: () => { toast('School updated'); qc.invalidateQueries({ queryKey: ['schools'] }); },
  });

  return (
    <Page title={status ? status + ' Schools' : 'All Schools'} subtitle="Manage tenant schools on the platform"
      actions={<a href="/schools/new" style={{ color: 'inherit' }}><Btn>+ New School</Btn></a>}>
      {schools.length === 0 ? <Empty title="No schools" subtitle="Create your first school." /> : (
        <div className="saa-card">
          <Table headers={['Name', 'Code', 'City', 'Plan', 'Students', 'Status', 'Actions']}
            rows={schools.map((s) => [
              s.name, s.code, s.city || '—', s.plan?.name || 'No plan',
              s._count?.students ?? 0,
              <Badge key={'b' + s.id} tone={statusTone[s.status] || 'slate'}>{s.status}</Badge>,
              <span key={'a' + s.id} style={{ whiteSpace: 'nowrap' }}>
                {s.status === 'PENDING' ? <Btn variant="secondary" onClick={() => setStatus.mutate({ id: s.id, status: 'ACTIVE' })}>Approve</Btn> : null}
                {' '}
                {s.status === 'ACTIVE' ? <Btn variant="danger" onClick={() => setStatus.mutate({ id: s.id, status: 'SUSPENDED' })}>Suspend</Btn> : null}
                {' '}
                {s.status === 'SUSPENDED' ? <Btn variant="secondary" onClick={() => setStatus.mutate({ id: s.id, status: 'ACTIVE' })}>Activate</Btn> : null}
              </span>,
            ])} />
        </div>
      )}
    </Page>
  );
};

export const SchoolDetail = () => {
  const { id } = useParams();
  const { data } = useQuery({ queryKey: ['school', id], queryFn: () => api(`/schools/${id}`) });
  // GET /schools/:id/usage — quota usage computed server-side (super-admin).
  const { data: usageData } = useQuery({ queryKey: ['school-usage', id], queryFn: () => api<any>(`/schools/${id}/usage`), enabled: !!id });
  const s = data?.data;
  const usage = usageData?.data;
  return (
    <Page title={(s as any)?.name || 'School'} subtitle={`School details & subscription`}>
      {s ? (
        <div className="saa-card">
          <p><b>Code:</b> {(s as any).code}</p>
          <p><b>Status:</b> {(s as any).status}</p>
          <p><b>Plan:</b> {(s as any).plan?.name || '—'}</p>
          <p><b>Students:</b> {(s as any)._count?.students || 0}</p>
          <p><b>Teachers:</b> {(s as any)._count?.teachers || 0}</p>
        </div>
      ) : <Empty title="Loading" />}
      {usage ? (
        <div className="saa-card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Usage (plan limits)</h3>
          <p><b>Students:</b> {usage.usage?.students ?? 0} / {usage.limits?.maxStudents ?? '∞'}</p>
          <p><b>Teachers:</b> {usage.usage?.teachers ?? 0} / {usage.limits?.maxTeachers ?? '∞'}</p>
          <p><b>Storage:</b> {usage.usage?.storageMb ?? 0} MB / {usage.limits?.maxStorageMb ?? '∞'} MB</p>
          <p><b>Subscription:</b> {usage.plan?.name || 'No plan'}</p>
        </div>
      ) : null}
    </Page>
  );
};