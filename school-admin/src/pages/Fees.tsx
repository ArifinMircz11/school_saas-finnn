import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Table, Btn, Field, SelectField, Empty, api, toast, formats } from '../services/api';

export default function Fees() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'structures' | 'assign' | 'collections'>('structures');
  const [struct, setStruct] = useState<any>({ name: '', amount: 0 });
  const [assign, setAssign] = useState<any>({ structureId: '', studentIds: [] });

  const { data: structures } = useQuery({ queryKey: ['feestructs'], queryFn: () => api<any[]>('/fees/structures') });
  const { data: students } = useQuery({ queryKey: ['students'], queryFn: () => api<any[]>('/students') });
  const { data: studentFees } = useQuery({ queryKey: ['feesStudents'], queryFn: () => api<any[]>('/fees/students') });
  const { data: categories } = useQuery({ queryKey: ['feecats'], queryFn: () => api<any[]>('/fees/categories') });

  const catOptions = ((categories?.success ? categories.data : []) || []).map((c: any) => ({ value: c.id, label: c.name }));
  const structOptions = ((structures?.success ? structures.data : []) || []).map((s: any) => ({ value: s.id, label: s.name }));
  const studentList = (students?.success ? students.data : []) || [];
  const feeRecs = (studentFees?.success ? studentFees.data : []) || [];
  const structList = (structures?.success ? structures.data : []) || [];

  const createStruct = useMutation({ mutationFn: (b: any) => api('/fees/structures', { method: 'POST', body: b }), onSuccess: () => { toast('Fee structure created'); setStruct({ name: '', amount: 0 }); qc.invalidateQueries({ queryKey: ['feestructs'] }); } });
  const assignFees = useMutation({ mutationFn: (b: any) => api('/fees/assign', { method: 'POST', body: b }), onSuccess: () => { toast('Fees assigned to students'); qc.invalidateQueries({ queryKey: ['feesStudents'] }); } });
  const collect = useMutation({ mutationFn: (b: any) => api('/fees/collect', { method: 'POST', body: b }), onSuccess: () => { toast('Payment recorded'); qc.invalidateQueries({ queryKey: ['feesStudents'] }); } });

  return (
    <Page title="Fees" subtitle="Structures, assignments and collections">
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {(['structures', 'assign', 'collections'] as const).map((t) => <Btn key={t} variant={tab === t ? 'primary' : 'secondary'} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</Btn>)}
      </div>

      {tab === 'structures' ? (
        <div className="saa-card" style={{ maxWidth: 520, display: 'grid', gap: 12 }}>
          <h3>New Fee Structure</h3>
          <Field label="Name" name="n" value={struct.name} onChange={(e) => setStruct({ ...struct, name: e.target.value })} />
          <Field label="Amount (₹)" name="a" type="number" value={struct.amount} onChange={(e) => setStruct({ ...struct, amount: Number(e.target.value) })} />
          <div><Btn onClick={() => createStruct.mutate(struct)}>{createStruct.isLoading ? 'Saving…' : 'Create Structure'}</Btn></div>
        </div>
      ) : null}

      {tab === 'assignees' ? (
        <div className="saa-card" style={{ maxWidth: 520, display: 'grid', gap: 12 }}>
          <h3>Assign Fee Structure to Students</h3>
          <SelectField label="Structure" name="s" value={assign.structureId} onChange={(e) => setAssign({ ...assign, structureId: e.target.value })} options={structOptions} placeholder="Select" />
          <div>
            <label className="saa-label">Students</label>
            <select className="saa-select" value={assign.studentIds[0] || ''} onChange={(e) => setAssign({ ...assign, studentIds: [e.target.value] })}>
              <option value="">Choose…</option>
              {studentList.map((s: any) => <option key={s.id} value={s.id}>{s.admissionNo} — {s.firstName} {s.lastName}</option>)}
            </select>
          </div>
          <Btn onClick={() => assign.structureId && assign.studentIds.length && assignFees.mutate(assign)}>Assign Fee</Btn>
        </div>
      ) : null}

      {tab === 'collections' ? (
        feeRecs.length === 0 ? <Empty title="No fee records" /> : (
          <div className="saa-card">
            <Table headers={['Student', 'Structure', 'Total', 'Paid', 'Due', 'Status', 'Collect']}
              rows={feeRecs.map((f: any) => [
                `${f.student?.firstName} ${f.student?.lastName}`, f.structure?.name,
                formats.money(f.totalAmount), formats.money(f.paidAmount),
                formats.money(Number(f.totalAmount) - Number(f.paidAmount) - Number(f.discount || 0)), f.status,
                <Btn key={'c' + f.id} variant="secondary" onClick={() => collect.mutate({ studentFeeId: f.id, amount: Math.max(1, Number(f.totalAmount) - Number(f.paidAmount) - Number(f.discount || 0)) })}>Collect</Btn>,
              ])} />
          </div>
        )
      ) : null}
    </Page>
  );
}