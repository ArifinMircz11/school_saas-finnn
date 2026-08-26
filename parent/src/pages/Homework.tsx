import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Table, Empty, Btn, Field, api, toast, formats } from '../services/api';

export default function Homework() {
  const qc = useQueryClient();
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const { data } = useQuery({ queryKey: ['homework'], queryFn: () => api<any[]>('/homework') });
  const list = (data?.success ? data.data : []) || [];
  // NOTE: /homework/:id/submit accepts an optional 'attachment' file (multipart
  // field "attachment"). The logged-in portal user is the student (parents use the
  // student's credentials), so this portal is who the backend ties the submission to.
  const submit = useMutation({
    mutationFn: (v: { id: string }) => api(`/homework/${v.id}/submit`, { method: 'POST', body: { content: note }, file: file || undefined, fileField: 'attachment' }),
    onSuccess: () => { toast('Homework submitted'); setFile(null); setNote(''); setSubmittingId(null); qc.invalidateQueries({ queryKey: ['homework'] }); },
    onError: () => setSubmittingId(null),
  });
  return (
    <Page title="Homework" subtitle="Homework assigned to your ward's class">
      {list.length === 0 ? <Empty title="No homework assigned" /> : (
        <div className="saa-card"><Table headers={['Title', 'Subject', 'Due', 'Attachment', 'Submit']} rows={list.map((h: any) => [h.title, h.subject?.name, formats.date(h.dueDate), h.attachmentUrl ? <a key={'a' + h.id} href={h.attachmentUrl} target="_blank" rel="noreferrer" style={{ fontSize: 14 }}>View</a> : '—',
          <span key={'s' + h.id} style={{ whiteSpace: 'nowrap' }}>
            {submittingId === h.id ? (
              <span style={{ display: 'inline-grid', gap: 6 }}>
                <input type="file" accept="image/*,.pdf,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                <Field label="Note" name="n" value={note} onChange={(e) => setNote(e.target.value)} />
                <Btn onClick={() => submit.mutate({ id: h.id })} disabled={submit.isLoading}>Submit</Btn>
              </span>
            ) : <Btn variant="secondary" onClick={() => { setSubmittingId(h.id); setFile(null); setNote(''); }}>Submit</Btn>}
          </span>])} /></div>
      )}
    </Page>
  );
}