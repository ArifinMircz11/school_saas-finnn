import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Table, Empty, Badge, Btn, api, toast } from '../services/api';

const tone = (s: string) => (s === 'APPROVED' || s === 'CONVERTED' ? 'green' : s === 'PENDING' ? 'amber' : s === 'REJECTED' ? 'red' : 'amber') as 'green' | 'amber' | 'red';

export default function Admissions() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['admissions'], queryFn: () => api<any[]>('/admissions') });
  const admissions = (data?.success ? data.data : []) || [];

  const review = useMutation({
    mutationFn: (v: { id: string; status: string }) => api(`/admissions/${v.id}/review`, { method: 'POST', body: { status: v.status } }),
    onSuccess: (r, v) => { toast(v.status === 'APPROVED' ? 'Admission approved — student created' : 'Admission updated'); qc.invalidateQueries({ queryKey: ['admissions'] }); },
  });

  return (
    <Page title="Admissions" subtitle="Review online applications">
      {admissions.length === 0 ? <Empty title="No applications" subtitle="Applicants appear here after using the public admission form." /> : (
        <div className="saa-card">
          <Table headers={['Application', 'Student', 'Class', 'Parent', 'Status', 'Actions']}
            rows={admissions.map((a: any) => [
              a.applicationNo, `${a.firstName} ${a.lastName}`, a.class?.name || '—',
              a.parentName || '—',
              <Badge key={'b' + a.id} tone={tone(a.status)}>{a.status}</Badge>,
              <span key={'a' + a.id} style={{ whiteSpace: 'nowrap' }}>
                {a.status !== 'CONVERTED' ? <Btn variant="secondary" onClick={() => review.mutate({ id: a.id, status: 'APPROVED' })}>Approve</Btn> : null}
                {' '}
                {a.status === 'PENDING' ? <Btn variant="danger" onClick={() => review.mutate({ id: a.id, status: 'REJECTED' })}>Reject</Btn> : null}
              </span>,
            ])} />
        </div>
      )}
    </Page>
  );
}