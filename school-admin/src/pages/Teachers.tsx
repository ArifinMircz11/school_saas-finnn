import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Table, Empty, Btn, Field, api, toast } from '../services/api';

export default function Teachers() {
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState<any>({});

  const { data } = useQuery({ queryKey: ['teachers'], queryFn: () => api<any[]>('/teachers') });
  const teachers = (data?.success ? data.data : []) || [];

  const create = useMutation({
    mutationFn: (b: any) => api('/teachers', { method: 'POST', body: b }),
    onSuccess: () => { toast('Teacher created'); setShow(false); setForm({}); qc.invalidateQueries({ queryKey: ['teachers'] }); },
  });

  return (
    <Page title="Teachers" subtitle="Manage teaching staff (accounts auto-created)" actions={<Btn onClick={() => setShow(!show)}>+ Add Teacher</Btn>}>
      {show ? (
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(form); }} className="saa-card" style={{ marginBottom: 20, maxWidth: 560, display: 'grid', gap: 12 }}>
          <Field label="First Name" name="fn" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
          <Field label="Last Name" name="ln" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
          <Field label="Email (for login)" name="em" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Field label="Designation" name="ds" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
          <div><Btn type="submit">Create Teacher</Btn></div>
        </form>
      ) : null}
      {teachers.length === 0 ? <Empty title="No teachers" /> : (
        <div className="saa-card">
          <Table headers={['Name', 'Email', 'Designation', 'Sections', 'Subjects']}
            rows={teachers.map((t: any) => [`${t.firstName} ${t.lastName}`, t.user?.email || '—', t.designation || '—', (t.sections || []).map((s: any) => s.section?.name).join(', '), (t.subjects || []).map((s: any) => s.subject?.name).join(', ')])} />
        </div>
      )}
    </Page>
  );
}