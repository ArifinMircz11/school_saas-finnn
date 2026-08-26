import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Table, Empty, Btn, Field, SelectField, api, toast, formats } from '../services/api';

export default function Homework() {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>({});
  const [file, setFile] = useState<File | null>(null);
  const { data: subjects } = useQuery({ queryKey: ['subjects'], queryFn: () => api<any[]>('/academic/subjects') });
  const { data: classes } = useQuery({ queryKey: ['classes'], queryFn: () => api<any[]>('/academic/classes') });
  const { data: hw } = useQuery({ queryKey: ['homework'], queryFn: () => api<any[]>('/homework') });
  const subjectOptions = ((subjects?.success ? subjects.data : []) || []).map((s: any) => ({ value: s.id, label: s.name }));
  const sectionOptions = []; ((classes?.success ? classes.data : []) || []).forEach((c: any) => (c.sections || []).forEach((s: any) => sectionOptions.push({ value: s.id, label: `${c.name}-${s.name}` })));
  const list = (hw?.success ? hw.data : []) || [];
  // NOTE: /homework accepts an optional 'attachment' file (multipart field
  // "attachment"). We send it via the api() `file`/`fileField` options.
  const create = useMutation({
    mutationFn: (b: any) => api('/homework', { method: 'POST', body: b, file: file || undefined, fileField: 'attachment' }),
    onSuccess: () => { toast('Homework created & published'); setForm({}); setFile(null); qc.invalidateQueries({ queryKey: ['homework'] }); },
  });
  return (
    <Page title="Homework" subtitle="Create homework for your sections">
      <div className="saa-card" style={{ maxWidth: 560, display: 'grid', gap: 12, marginBottom: 20 }}>
        <Field label="Title" name="t" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <Field label="Description" name="d" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <SelectField label="Section" name="s" value={form.sectionId} onChange={(e) => setForm({ ...form, sectionId: e.target.value })} options={sectionOptions} placeholder="Select" />
        <SelectField label="Subject" name="su" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} options={subjectOptions} placeholder="Select" />
        <Field label="Due Date" name="dd" type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required />
        <label className="saa-label">Attachment (optional)</label>
        <input className="saa-input" type="file" accept="image/*,.pdf,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <Btn onClick={() => form.title && form.subjectId && form.dueDate && create.mutate(form)} disabled={create.isLoading}>Publish Homework</Btn>
      </div>
      {list.length === 0 ? <Empty title="No homework yet" /> : (
        <div className="saa-card"><Table headers={['Title', 'Subject', 'Section', 'Due', 'Submissions', 'Attachment']} rows={list.map((h: any) => [h.title, h.subject?.name, h.section ? `${h.section.class?.name}-${h.section.name}` : '—', formats.date(h.dueDate), (h.submissions || []).length, h.attachmentUrl ? <a key={'a' + h.id} href={h.attachmentUrl} target="_blank" rel="noreferrer" style={{ fontSize: 14 }}>View</a> : '—'])} /></div>
      )}
    </Page>
  );
}