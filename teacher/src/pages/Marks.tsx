import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Table, Empty, Btn, SelectField, Field, api, toast } from '../services/api';

export default function Marks() {
  const qc = useQueryClient();
  const [examSubjectId, setExamSubjectId] = useState('');
  const [points, setPoints] = useState<Record<string, number>>({});

  const { data: exams } = useQuery({ queryKey: ['exams'], queryFn: () => api<any[]>('/exams') });
  const esOptions = []; ((exams?.success ? exams.data : []) || []).forEach((e: any) => (e.subjects || []).forEach((es: any) => esOptions.push({ value: es.id, label: `${e.name} — ${es.subject?.name}` })));

  const { data: students } = useQuery({ queryKey: ['students'], queryFn: () => api<any[]>('/students') });
  const studentList = (students?.success ? students.data : []) || [];

  const enter = useMutation({
    mutationFn: (m: any[]) => api('/marks', { method: 'POST', body: { examSubjectId, marks: m } }),
    onSuccess: () => { toast('Marks saved'); qc.invalidateQueries({ queryKey: ['marks'] }); },
  });

  const publish = useMutation({ mutationFn: (examId: string) => api('/results/publish', { method: 'POST', body: { examId } }), onSuccess: () => toast('Results published') });

  return (
    <Page title="Exams & Marks" subtitle="Enter marks and publish results">
      <div className="saa-card" style={{ maxWidth: 560, display: 'grid', gap: 12, marginBottom: 16 }}>
        <SelectField label="Exam Subject" name="es" value={examSubjectId} onChange={(e) => setExamSubjectId(e.target.value)} options={esOptions} placeholder="Select exam subject" />
        <Btn onClick={() => examSubjectId && studentList.length && enter.mutate(studentList.map((s: any) => ({ studentId: s.id, marksObtained: points[s.id] ?? 0 })))} disabled={enter.isLoading}>Save All Marks</Btn>
      </div>
      {studentList.length === 0 ? <Empty title="No students" /> : (
        <div className="saa-card"><Table headers={['Name', 'Marks']} rows={studentList.map((s: any) => [s.firstName + ' ' + s.lastName, <input key={'m' + s.id} className="saa-input" type="number" value={points[s.id] ?? ''} onChange={(e) => setPoints({ ...points, [s.id]: Number(e.target.value) })} style={{ width: 90 }} />])} /></div>
      )}
      <div className="saa-card" style={{ marginTop: 16 }}>
        <h3>Publish Results</h3>
        {((exams?.success ? exams.data : []) || []).map((e: any) => <Btn key={e.id} variant="secondary" style={{ margin: 4 }} onClick={() => publish.mutate(e.id)}>Publish: {e.name}</Btn>)}
      </div>
    </Page>
  );
}