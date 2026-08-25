import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Table, Empty, Btn, Field, SelectField, api, toast, formats } from '../services/api';

export default function Notices() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: '', content: '', audience: 'ALL' });
  const { data } = useQuery({ queryKey: ['notices'], queryFn: () => api<any[]>('/notices') });
  const list = (data?.success ? data.data : []) || [];
  const create = useMutation({ mutationFn: (b: any) => api('/notices', { method: 'POST', body: b }), onSuccess: () => { toast('Notice published'); setForm({ title: '', content: '', audience: 'ALL' }); qc.invalidateQueries({ queryKey: ['notices'] }); } });
  return (
    <Page title="Notices" subtitle="Broadcast notices to school audiences">
      <div className="saa-card" style={{ maxWidth: 560, display: 'grid', gap: 12, marginBottom: 20 }}>
        <Field label="Title" name="t" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <Field label="Content" name="c" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} required />
        <SelectField label="Audience" name="a" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} options={['ALL', 'TEACHERS', 'STUDENTS', 'PARENTS'].map((a) => ({ value: a, label: a }))} />
        <Btn onClick={() => create.mutate(form)} disabled={create.isLoading}>Publish Notice</Btn>
      </div>
      {list.length === 0 ? <Empty title="No notices" /> : (
        <div className="saa-card"><Table headers={['Title', 'Audience', 'Posted']} rows={list.map((n: any) => [n.title, n.audience, formats.date(n.createdAt)])} /></div>
      )}
    </Page>
  );
}