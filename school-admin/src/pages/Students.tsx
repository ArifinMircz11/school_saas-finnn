import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Table, Empty, Btn, Field, SelectField, api, toast, formats } from '../services/api';

interface Student { id: string; firstName: string; lastName: string; admissionNo: string; gender: string; dob: string; class?: { name: string } | null; section?: { name: string } | null; parents?: { parent?: { firstName?: string } }[]; }

export default function Students() {
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState<any>({});
  const [q, setQ] = useState('');

  const { data: classes } = useQuery({ queryKey: ['classes'], queryFn: () => api<any[]>('/academic/classes') });
  const classOptions = ((classes?.success ? classes.data : []) || []).map((c: any) => ({ value: c.id, label: c.name }));

  const { data } = useQuery({ queryKey: ['students', q], queryFn: () => api<Student[]>(`/students${q ? '?q=' + q : ''}`) });
  const students = (data?.success ? data.data : []) || [];

  const create = useMutation({
    mutationFn: (b: any) => api('/students', { method: 'POST', body: b }),
    onSuccess: () => { toast('Student created'); setShow(false); setForm({}); qc.invalidateQueries({ queryKey: ['students'] }); },
    onError: (e: any) => toast(e?.message || 'Failed'),
  });

  return (
    <Page title="Students" subtitle="Manage student records"
      actions={<Btn onClick={() => setShow(!show)}>+ Add Student</Btn>}>
      <div style={{ marginBottom: 16, display: 'flex', gap: 10 }}>
        <input className="saa-input" placeholder="Search by name / admission no" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {show ? (
        <form onSubmit={(e) => { e.preventDefault(); create.mutate(form); }} className="saa-card" style={{ marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 720 }}>
          <Field label="First Name" name="fn" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
          <Field label="Last Name" name="ln" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
          <Field label="Gender" name="gn" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} placeholder="MALE / FEMALE / OTHER" />
          <Field label="Date of Birth" name="dob" type="date" value={form.dob} onChange={(e) => setForm({ ...form, dob: e.target.value })} />
          <SelectField label="Class" name="classId" value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })} options={classOptions} placeholder="Select class" />
          <Field label="Parent Email" name="pe" type="email" value={form.parentEmail} onChange={(e) => setForm({ ...form, parentEmail: e.target.value })} />
          <Field label="Parent Name" name="pn" value={form.parentName} onChange={(e) => setForm({ ...form, parentName: e.target.value })} />
          <div style={{ gridColumn: '1 / -1' }}><Btn type="submit">{create.isLoading ? 'Saving…' : 'Create Student'}</Btn></div>
        </form>
      ) : null}

      {students.length === 0 ? <Empty title="No students" /> : (
        <div className="saa-card">
          <Table headers={['Admission No', 'Name', 'Gender', 'Class', 'Section', 'Parent']}
            rows={students.map((s) => [s.admissionNo, `${s.firstName} ${s.lastName}`, s.gender, s.class?.name || '—', s.section?.name || '—', s.parents?.[0]?.parent?.firstName || '—'])} />
        </div>
      )}
    </Page>
  );
}