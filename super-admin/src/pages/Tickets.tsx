import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Table, Badge, Btn, Field, api, toast } from '../services/api';

export default function Tickets() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState({ subject: '', description: '', priority: 'MEDIUM' });
  const { data } = useQuery({ queryKey: ['tickets'], queryFn: () => api<any[]>('/tickets') });
  const tickets = (data?.success ? data.data : []) || [];

  const create = useMutation({
    mutationFn: (b: any) => api('/tickets', { method: 'POST', body: b }),
    onSuccess: () => { toast('Ticket created'); setDraft({ subject: '', description: '', priority: 'MEDIUM' }); qc.invalidateQueries({ queryKey: ['tickets'] }); },
  });
  const tone = (s: string) => (s === 'OPEN' ? 'amber' : s === 'CLOSED' ? 'green' : 'slate') as 'amber' | 'green' | 'slate';

  return (
    <Page title="Support Tickets" subtitle="View and manage platform support requests">
      <form onSubmit={(e) => { e.preventDefault(); create.mutate(draft); }} className="saa-card" style={{ maxWidth: 620, display: 'grid', gap: 12, marginBottom: 20 }}>
        <Field label="Subject" name="s" value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} required />
        <Field label="Description" name="d" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} required />
        <div><Btn type="submit">{create.isLoading ? 'Opening…' : 'Open Ticket'}</Btn></div>
      </form>
      <div className="saa-card">
        <Table headers={['ID', 'Subject', 'Priority', 'Status']}
          rows={tickets.map((t: any) => [String(t.id).slice(0, 8), t.subject, t.priority, <Badge key={'b' + t.id} tone={tone(t.status)}>{t.status}</Badge>])} />
      </div>
    </Page>
  );
}