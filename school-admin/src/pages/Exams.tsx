import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Page, Table, Empty, Btn, Field, api, toast } from '../services/api';

export default function Exams() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'exams' | 'marks' | 'results'>('exams');
  const [exam, setExam] = useState<any>({ name: '', startDate: '', endDate: '' });

  const { data: exams } = useQuery({ queryKey: ['exams'], queryFn: () => api<any[]>('/exams') });
  const { data: results } = useQuery({ queryKey: ['results'], queryFn: () => api<any[]>('/results') });
  const examList = (exams?.success ? exams.data : []) || [];
  const resultList = (results?.success ? results.data : []) || [];

  const createExam = useMutation({ mutationFn: (b: any) => api('/exams', { method: 'POST', body: b }), onSuccess: () => { toast('Exam created'); setExam({ name: '', startDate: '', endDate: '' }); qc.invalidateQueries({ queryKey: ['exams'] }); } });
  const publish = useMutation({ mutationFn: (examId: string) => api('/results/publish', { method: 'POST', body: { examId } }), onSuccess: () => { toast('Results published'); qc.invalidateQueries({ queryKey: ['results'] }); } });

  return (
    <Page title="Examinations" subtitle="Exams, marks and results">
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {(['exams', 'marks', 'results'] as const).map((t) => <Btn key={t} variant={tab === t ? 'primary' : 'secondary'} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</Btn>)}
      </div>

      {tab === 'exams' ? (
        <>
          <div className="saa-card" style={{ maxWidth: 520, display: 'grid', gap: 12, marginBottom: 20 }}>
            <Field label="Exam Name" name="n" value={exam.name} onChange={(e) => setExam({ ...exam, name: e.target.value })} />
            <Field label="Start Date" name="s" type="date" value={exam.startDate} onChange={(e) => setExam({ ...exam, startDate: e.target.value })} />
            <Field label="End Date" name="e" type="date" value={exam.endDate} onChange={(e) => setExam({ ...exam, endDate: e.target.value })} />
            <Btn onClick={() => createExam.mutate(exam)} disabled={createExam.isLoading}>Create Exam</Btn>
          </div>
          {examList.length === 0 ? <Empty title="No exams" /> : (
            <div className="saa-card"><Table headers={['Name', 'Start', 'End', 'Subjects']} rows={examList.map((e: any) => [e.name, e.startDate?.slice(0, 10), e.endDate?.slice(0, 10), (e.subjects || []).length])} /></div>
          )}
        </>
      ) : null}

      {tab === 'marks' ? <div className="saa-card"><p>Enter marks for students per subject. (Teacher dashboard handles mark entry; results shown here.)</p></div> : null}

      {tab === 'results' ? (
        resultList.length === 0 ? <Empty title="No results yet" /> : (
          <>
            <div className="saa-card" style={{ marginBottom: 16 }}>
              {examList.map((e: any) => <Btn key={e.id} variant="secondary" onClick={() => publish.mutate(e.id)} style={{ margin: 4 }}>Publish: {e.name}</Btn>)}
            </div>
            <div className="saa-card"><Table headers={['Student', 'Exam', 'Subject', 'Marks', 'Published']} rows={resultList.map((r: any) => [`${r.student?.firstName} ${r.student?.lastName}`, r.exam?.name, r.examSubject?.subject?.name, Number(r.marksObtained), r.published ? 'Yes' : 'No'])} /></div>
          </>
        )
      ) : null}
    </Page>
  );
}