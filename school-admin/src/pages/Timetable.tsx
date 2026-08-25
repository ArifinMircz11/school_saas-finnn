import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Table, Btn, SelectField, Field, Empty, api, toast } from '../services/api';

export default function Timetable() {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>({ day: 'MONDAY' });
  const { data: classes } = useQuery({ queryKey: ['classes'], queryFn: () => api<any[]>('/academic/classes') });
  const { data: subjects } = useQuery({ queryKey: ['subjects'], queryFn: () => api<any[]>('/academic/subjects') });
  const { data: teachers } = useQuery({ queryKey: ['teachers'], queryFn: () => api<any[]>('/teachers') });
  const { data: tt } = useQuery({ queryKey: ['timetable'], queryFn: () => api<any>('/timetable') });
  const entries = tt?.data?.entries || [];

  const sectionOptions = []; ((classes?.success ? classes.data : []) || []).forEach((c: any) => (c.sections || []).forEach((s: any) => sectionOptions.push({ value: s.id, label: `${c.name}-${s.name}` })));
  const subjectOptions = ((subjects?.success ? subjects.data : []) || []).map((s: any) => ({ value: s.id, label: s.name }));
  const teacherOptions = ((teachers?.success ? teachers.data : []) || []).map((t: any) => ({ value: t.id, label: `${t.firstName} ${t.lastName}` }));
  const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

  const add = useMutation({ mutationFn: (b: any) => api('/timetable', { method: 'POST', body: b }), onSuccess: () => { toast('Entry added'); setForm({ day: 'MONDAY' }); qc.invalidateQueries({ queryKey: ['timetable'] }); } });

  return (
    <Page title="Timetable" subtitle="Schedule classes, teachers and subjects (conflicts flagged)">
      <div className="saa-card" style={{ maxWidth: 720, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        <SelectField label="Section" name="se" value={form.sectionId} onChange={(e) => setForm({ ...form, sectionId: e.target.value })} options={sectionOptions} placeholder="Section" />
        <SelectField label="Subject" name="su" value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })} options={subjectOptions} placeholder="Subject" />
        <SelectField label="Teacher" name="te" value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })} options={teacherOptions} placeholder="Teacher" />
        <SelectField label="Day" name="day" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} options={days.map((d) => ({ value: d, label: d }))} />
        <Field label="Start" name="st" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} placeholder="09:00" />
        <Field label="End" name="en" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} placeholder="09:45" />
        <div style={{ gridColumn: '1 / -1' }}><Btn onClick={() => form.sectionId && form.subjectId && form.teacherId && add.mutate(form)} disabled={add.isLoading}>Add Slot</Btn></div>
      </div>
      {entries.length === 0 ? <Empty title="No timetable entries" /> : (
        <div className="saa-card"><Table headers={['Day', 'Start', 'End', 'Section', 'Subject', 'Teacher']} rows={entries.map((e: any) => [e.day, e.startTime, e.endTime, `${e.section?.class?.name}-${e.section?.name}`, e.subject?.name, `${e.teacher?.firstName} ${e.teacher?.lastName}`])} /></div>
      )}
    </Page>
  );
}