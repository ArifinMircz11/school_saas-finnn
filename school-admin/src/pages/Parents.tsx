import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Table, Empty, Btn, Field, api, toast } from '../services/api';

export default function Parents() {
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState<any>({});

  const { data } = useQuery({ queryKey: ['parents'], queryFn: () => api<any[]>('/parents') });
  const parents = (data?.success ? data.data : []) || [];

  const create = useMutation({
    mutationFn: (b: any) => api('/parents', { method: 'POST', body: b }),
    onSuccess: () => { toast('Parent created'); setShow(false); setForm({}); qc.invalidateQueries({ queryKey: ['parents'] }); },
  });

  return (
    <Page title="Parents" subtitle="Manage parent accounts" actions={<Btn onClick={() => setShow(!show)}>+ Add Parent</Btn>}>
      {show ? (
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(form); }} className="saa-card" style={{ marginBottom: 20, maxWidth: 560, display: 'grid', gap: 12 }}>
          <Field label="First Name" name="fn" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
          <Field label="Last Name" name="ln" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
          <Field label="Email" name="em" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Field label="Phone" name="ph" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <div><Btn type="submit">Create Parent</Btn></div>
        </form>
      ) : null}
      {parents.length === 0 ? <Empty title="No parents" /> : (
        <div className="saa-card">
          <Table headers={['Name', 'Email', 'Phone', 'Children']}
            rows={parents.map((p: any) => [`${p.firstName} ${p.lastName}`, p.user?.email || '—', p.phone || '—', (p.children || []).length])} />
        </div>
      )}
    </Page>
  );
}