import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Table, Badge, Btn, Field, SelectField, Empty, api, toast, formats } from '../services/api';

const TYPES = [
  { value: 'TEACHER_LEAVE', label: 'Teacher Leave' },
  { value: 'STAFF_LEAVE', label: 'Staff Leave' },
  { value: 'STUDENT_LEAVE', label: 'Student Leave' },
  { value: 'ADMISSION', label: 'Admission' },
  { value: 'RESULT_PUBLISH', label: 'Result Publication' },
  { value: 'CERTIFICATE', label: 'Certificate' },
  { value: 'TC', label: 'Transfer Certificate' },
  { value: 'OTHER', label: 'Other' },
];

export default function Approvals() {
  const qc = useQueryClient();
  const [type, setType] = useState('TEACHER_LEAVE');
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [showForm, setShowForm] = useState(false);

  const list = useQuery({ queryKey: ['approvals'], queryFn: () => api<any>('/principal/approvals') });
  const approvals = list.data?.data || [];
  const pending = approvals.filter((a: any) => a.status === 'PENDING').length;

  const create = useMutation({
    mutationFn: () => api('/principal/approvals', { method: 'POST', body: { type, title, description: desc } }),
    onSuccess: (r) => { toast(r.success ? 'Request submitted' : (r.message || 'Failed')); if (r.success) { setShowForm(false); setTitle(''); setDesc(''); qc.invalidateQueries({ queryKey: ['approvals'] }); } },
  });

  const review = useMutation({
    mutationFn: ({ id, action, comment }: { id: string; action: string; comment?: string }) =>
      api(`/principal/approvals/${id}/review`, { method: 'POST', body: { action, comment } }),
    onSuccess: (r, v) => { toast(r.success ? `Approval ${v.action.toLowerCase()}` : (r.message || 'Failed')); if (r.success) qc.invalidateQueries({ queryKey: ['approvals'] }); },
  });

  const badge = (s: string) => <Badge tone={s === 'APPROVED' ? 'green' : s === 'REJECTED' ? 'red' : s === 'CHANGES_REQUESTED' ? 'amber' : 'slate'}>{s}</Badge>;
  const rows = approvals.map((a: any) => [
    <Badge tone="slate">{a.type}</Badge>, a.title, a.description || '—', formats.date(a.createdAt), badge(a.status),
    a.status === 'PENDING' ? (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Btn onClick={() => review.mutate({ id: a.id, action: 'APPROVE' })}>Approve</Btn>
        <Btn variant="danger" onClick={() => review.mutate({ id: a.id, action: 'REJECT' })}>Reject</Btn>
        <Btn variant="secondary" onClick={() => review.mutate({ id: a.id, action: 'CHANGES', comment: 'Please revise' })}>Request changes</Btn>
      </div>
    ) : a.comment || '—',
  ]);

  return (
    <Page title="Leave & Approvals" subtitle={`Approval center · ${pending} pending`} actions={<Btn onClick={() => setShowForm(!showForm)}>{showForm ? 'Close' : '+ New request'}</Btn>}>
      {showForm ? (
        <div className="saa-card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
            <SelectField label="Type" name="type" value={type} onChange={(e) => setType(e.target.value)} options={TYPES} />
            <Field label="Title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Leave request for…" />
            <Field label="Description" name="desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Details" />
          </div>
          <div style={{ marginTop: 12 }}><Btn onClick={() => create.mutate()} disabled={!title || create.isPending}>Submit request</Btn></div>
        </div>
      ) : null}

      {list.isLoading ? <p>Loading…</p> : approvals.length === 0 ? <Empty title="No approvals yet" subtitle="Requests created by staff/teachers will appear here for your decision." /> : (
        <Table headers={['Type', 'Title', 'Description', 'Requested', 'Status', 'Actions / Comment']} rows={rows} />
      )}
    </Page>
  );
}