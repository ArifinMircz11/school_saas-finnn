import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Table, Empty, Btn, api, toast, formats } from '../services/api';

export default function Homework() {
  const qc = useQueryClient();
  const [content, setContent] = useState<Record<string, string>>({});
  const { data } = useQuery({ queryKey: ['homework'], queryFn: () => api<any[]>('/homework') });
  const list = (data?.success ? data.data : []) || [];
  const submit = useMutation({
    mutationFn: (v: { id: string; content: string }) => api(`/homework/${v.id}/submit`, { method: 'POST', body: { content } }),
    onSuccess: () => { toast('Submitted'); qc.invalidateQueries({ queryKey: ['homework'] }); },
  });
  return (
    <Page title="Homework" subtitle="View and submit homework">
      {list.length === 0 ? <Empty title="No homework assigned yet" /> : (
        <div className="saa-card">
          <Table headers={['Title', 'Subject', 'Due', 'Submitted?', 'Submit']} rows={list.map((h: any) => [
            h.title, h.subject?.name, formats.date(h.dueDate),
            (h.submissions || []).length ? 'Yes' : 'No',
            (h.submissions || []).length === 0 ? (
              <span key={'s' + h.id} style={{ display: 'flex', gap: 6 }}>
                <input className="saa-input" placeholder="Answer" value={content[h.id] || ''} onChange={(e) => setContent({ ...content, [h.id]: e.target.value })} />
                <Btn onClick={() => content[h.id] && submit.mutate({ id: h.id, content: content[h.id] })}>Submit</Btn>
              </span>
            ) : '—',
          ])} />
        </div>
      )}
    </Page>
  );
}