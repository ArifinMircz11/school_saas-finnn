import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Table, Empty, Btn, SelectField, api, toast } from '../services/api';

export default function Attendance() {
  const qc = useQueryClient();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [sectionId, setSectionId] = useState('');
  const [marks, setMarks] = useState<Record<string, string>>({});

  const { data: sections } = useQuery({ queryKey: ['sections'], queryFn: () => api<any[]>('/academic/classes') });
  const sectionOptions = [];
  ((sections?.success ? sections.data : []) || []).forEach((c: any) => (c.sections || []).forEach((s: any) => sectionOptions.push({ value: s.id, label: `${c.name} — ${s.name}` })));

  const { data: students } = useQuery({ queryKey: ['classStudents', sectionId], queryFn: () => api<any[]>(`/students${sectionId ? '?sectionId=' + sectionId : ''}`) });
  const studentList = (students?.success ? students.data : []) || [];

  const save = useMutation({
    mutationFn: (records: any[]) => api('/attendance/mark', { method: 'POST', body: { date, records } }),
    onSuccess: () => { toast('Attendance saved'); qc.invalidateQueries({ queryKey: ['attendance'] }); },
  });

  return (
    <Page title="Attendance" subtitle="Mark attendance for a section on a date">
      <div className="saa-card" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <div style={{ minWidth: 180 }}><label className="saa-label">Date</label><input className="saa-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div style={{ minWidth: 220 }}><SelectField label="Section" name="s" value={sectionId} onChange={(e) => setSectionId(e.target.value)} options={sectionOptions} placeholder="Select section" /></div>
        <Btn onClick={() => studentList.length && save.mutate(studentList.map((s: any) => ({ studentId: s.id, status: marks[s.id] || 'PRESENT' })))} disabled={save.isLoading}>Save Attendance</Btn>
      </div>

      {studentList.length === 0 ? <Empty title="No students in this section" /> : (
        <div className="saa-card">
          <Table headers={['Admission', 'Student', 'Status']}
            rows={studentList.map((s: any) => [
              s.admissionNo, `${s.firstName} ${s.lastName}`,
              <select key={'sel' + s.id} className="saa-select" style={{ width: 140 }} value={marks[s.id] || 'PRESENT'} onChange={(e) => setMarks({ ...marks, [s.id]: e.target.value })}>
                {['PRESENT', 'ABSENT', 'LATE', 'LEAVE'].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>,
            ])} />
        </div>
      )}
    </Page>
  );
}