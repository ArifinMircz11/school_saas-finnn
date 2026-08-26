import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Table, Btn, Field, Empty, api, toast } from '../services/api';

interface Plan { id: string; name: string; code: string; price: number; period: string; maxStudents: number; maxTeachers: number; isActive: boolean; }

const emptyPlan = { name: '', code: '', price: 0, period: 'MONTHLY', maxStudents: 1000, maxTeachers: 100, maxAdmins: 5, maxStorage: 10240, modules: {} };

export default function Plans() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<any>(emptyPlan);

  const { data } = useQuery({ queryKey: ['plans'], queryFn: () => api<Plan[]>('/plans') });
  const plans = ((data?.success && data.data) || []) as Plan[];

  // GET /subscriptions — list tenant subscriptions (super-admin).
  const { data: subsData } = useQuery({ queryKey: ['subscriptions'], queryFn: () => api<any[]>('/subscriptions') });
  const subs = (subsData?.success ? subsData.data : []) || [];

  const save = useMutation({
    mutationFn: (p: any) => api('/plans', { method: 'POST', body: p }),
    onSuccess: () => { toast('Plan saved'); setDraft(emptyPlan); qc.invalidateQueries({ queryKey: ['plans'] }); },
  });

  return (
    <Page title="Subscriptions & Plans" subtitle="Manage billing plans and limits">
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(draft); }} className="saa-card" style={{ maxWidth: 720, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
        <Field label="Name" name="name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} required />
        <Field label="Code" name="code" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} required />
        <Field label="Price (₹)" name="price" type="number" value={draft.price} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} />
        <Field label="Max Students" name="maxStudents" type="number" value={draft.maxStudents} onChange={(e) => setDraft({ ...draft, maxStudents: Number(e.target.value) })} />
        <Field label="Max Teachers" name="maxTeachers" type="number" value={draft.maxTeachers} onChange={(e) => setDraft({ ...draft, maxTeachers: Number(e.target.value) })} />
        <Field label="Max Storage (MB)" name="maxStorage" type="number" value={draft.maxStorage} onChange={(e) => setDraft({ ...draft, maxStorage: Number(e.target.value) })} />
        <div style={{ gridColumn: '1 / -1' }}><Btn type="submit">{save.isLoading ? 'Saving…' : 'Save Plan'}</Btn></div>
      </form>

      {plans.length === 0 ? <Empty title="No plans" /> : (
        <div className="saa-card">
          <Table headers={['Name', 'Price', 'Period', 'Students', 'Teachers', 'Storage', 'Status']}
            rows={plans.map((p) => [p.name, '₹' + p.price, p.period, p.maxStudents, p.maxTeachers, p.maxStorage + 'MB', p.isActive ? 'Active' : 'Inactive'])} />
        </div>
      )}

      {subs.length > 0 ? (
        <div className="saa-card" style={{ marginTop: 20 }}>
          <h3 style={{ marginTop: 0 }}>Active Subscriptions</h3>
          <Table headers={['School', 'Plan', 'Status', 'Period']}
            rows={subs.map((s: any) => [s.school?.name || s.schoolId, s.plan?.name || '—', s.status, `${new Date(s.startDate).toLocaleDateString()} → ${new Date(s.endDate).toLocaleDateString()}`])} />
        </div>
      ) : null}
    </Page>
  );
}